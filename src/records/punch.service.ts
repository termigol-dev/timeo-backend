import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  RecordType,
  IncidentType,
  IncidentBy,
} from '@prisma/client';

type ScheduleEvaluation = {
  status: 'OK' | 'EARLY' | 'LATE';
  expectedTime?: string;
  diffMinutes?: number;
};

@Injectable()
export class PunchService {

  constructor(
    private readonly prisma: PrismaService,
  ) { }

  /* ======================================================
   🧪 SIMULADOR (NO SE TOCA)
  ====================================================== */

  async simulateDay(body: {
    userId: string;
    companyId: string;
    branchId: string;
    date: string;
    inTime?: string | null;
    outTime?: string | null;
  }) {

    const { userId, companyId, branchId, date, inTime, outTime } = body;

    const results: any[] = [];

    const events: { type: RecordType; createdAt: Date }[] = [];

    if (inTime) {
      events.push({
        type: RecordType.IN,
        createdAt: this.buildLocalDate(date, inTime),
      });
    }

    if (outTime) {
      events.push({
        type: RecordType.OUT,
        createdAt: this.buildLocalDate(date, outTime),
      });
    }

    for (const event of events) {

      const evaluation = await this.evaluateSchedule({
        userId,
        branchId,
        date: event.createdAt,
        type: event.type,
      });

      const incident = this.handleIncidentFromEvaluation({
        evaluation,
        recordType: event.type,
        recordCreatedAt: event.createdAt,
        userId,
        companyId,
        branchId,
      });

      results.push({
        event,
        evaluation,
        incident,
      });
    }

    return {
      simulatedEvents: results,
    };
  }

  /* ======================================================
   🔥 PUNCH REAL
  ====================================================== */

  async punch(params: {
    userId: string;
    companyId: string;
    branchId: string;
    type: RecordType;
    createdBy: 'TABLET' | 'MOBILE';
  }) {

    const { userId, companyId, branchId, type } = params;

    const membership = await this.getActiveMembership(
      userId,
      companyId,
      branchId,
    );

    const lastRecord = await this.getLastRecord(membership.id);

    if (type === RecordType.IN && lastRecord?.type === RecordType.IN) {
      throw new BadRequestException('Already IN');
    }

    if (type === RecordType.OUT && (!lastRecord || lastRecord.type === RecordType.OUT)) {
      throw new BadRequestException('No active IN');
    }

    // 📝 1. CREAR RECORD
    const record = await this.createRecord({
      type,
      userId,
      companyId,
      branchId,
      membershipId: membership.id,
    });

    // 🧠 2. EVALUAR
    const evaluation = await this.evaluateSchedule({
      userId,
      branchId,
      date: record.createdAt,
      type,
    });

    console.log('🧠 EVALUATION:', {
      type,
      createdAt: record.createdAt,
      evaluation,
    });

    // 🎯 3. CREAR INCIDENCIA
    await this.handleIncidentFromEvaluation({
      evaluation,
      recordType: type,
      recordId: record.id,
      recordCreatedAt: record.createdAt,
      userId,
      membershipId: membership.id,
      companyId,
      branchId,
    });

    return record;
  }

  /* ======================================================
   🧠 EVALUACIÓN
  ====================================================== */

  private async evaluateSchedule({
  userId,
  branchId,
  date,
  type,
}: {
  userId: string;
  branchId: string;
  date: Date;
  type: RecordType;
}): Promise<ScheduleEvaluation> {

  const weekday = date.getDay() === 0 ? 7 : date.getDay();

  const schedule = await this.prisma.schedule.findFirst({
    where: {
      userId,
      branchId,
      validFrom: { lte: date },
      OR: [{ validTo: null }, { validTo: { gte: date } }],
    },
    include: { shifts: true },
  });

  // 🔥 AJUSTE HORARIO ESPAÑA
  const localDate = new Date(date.getTime() + 60 * 60 * 1000);
  const nowMinutes = localDate.getHours() * 60 + localDate.getMinutes();

  // ❗️ SIN HORARIO → IN_EARLY / OUT_EARLY (tu regla)
  if (!schedule) {
    return {
      status: 'EARLY',
      diffMinutes: -999,
    };
  }

  const shiftsOfDay = schedule.shifts.filter(
    s => s.weekday === weekday,
  );

  if (shiftsOfDay.length === 0) {
    return {
      status: 'EARLY',
      diffMinutes: -999,
    };
  }

  const enriched = shiftsOfDay.map(s => ({
    ...s,
    startMinutes: this.timeToMinutes(s.startTime),
    endMinutes: this.timeToMinutes(s.endTime),
  }));

  // 🔥 CLAVE: detectar turno en vigor
  const activeShift = enriched.find(
    s => nowMinutes >= s.startMinutes && nowMinutes <= s.endMinutes
  );

  /* ============================
     🟦 IN
  ============================ */
  if (type === RecordType.IN) {

    // ✅ PRIORIDAD: turno activo
    if (activeShift) {
      return this.evaluateDiff(
        nowMinutes - activeShift.startMinutes,
        activeShift.startTime,
      );
    }

    // 👉 si no → el más cercano por START
    const closest = enriched
      .map(s => ({
        shift: s,
        diff: Math.abs(nowMinutes - s.startMinutes),
      }))
      .sort((a, b) => a.diff - b.diff)[0];

    return this.evaluateDiff(
      nowMinutes - closest.shift.startMinutes,
      closest.shift.startTime,
    );
  }

  /* ============================
     🟥 OUT
  ============================ */
  if (type === RecordType.OUT) {

    // ✅ PRIORIDAD: turno activo
    if (activeShift) {
      return this.evaluateDiff(
        nowMinutes - activeShift.endMinutes,
        activeShift.endTime,
      );
    }

    // 👉 si no → el más cercano por END
    const closest = enriched
      .map(s => ({
        shift: s,
        diff: Math.abs(nowMinutes - s.endMinutes),
      }))
      .sort((a, b) => a.diff - b.diff)[0];

    return this.evaluateDiff(
      nowMinutes - closest.shift.endMinutes,
      closest.shift.endTime,
    );
  }

  return { status: 'EARLY' };
}

  private evaluateDiff(
    diffMinutes: number,
    expectedTime?: string,
  ): ScheduleEvaluation {

    if (Math.abs(diffMinutes) <= 15) {
      return { status: 'OK', expectedTime };
    }

    if (diffMinutes < -15) {
      return { status: 'EARLY', expectedTime, diffMinutes };
    }

    return { status: 'LATE', expectedTime, diffMinutes };
  }

  /* ======================================================
   🎯 INCIDENCIAS
  ====================================================== */

  private async handleIncidentFromEvaluation({
    evaluation,
    recordType,
    recordId,
    recordCreatedAt,
    userId,
    membershipId,
    companyId,
    branchId,
  }: any) {

    if (evaluation.status === 'OK') return;

    let type: IncidentType | null = null;

    if (evaluation.status === 'EARLY') {
      type =
        recordType === RecordType.IN
          ? IncidentType.IN_EARLY
          : IncidentType.OUT_EARLY;
    }

    if (evaluation.status === 'LATE') {
      type =
        recordType === RecordType.IN
          ? IncidentType.IN_LATE
          : IncidentType.OUT_LATE;
    }

    if (!type) return;

    await this.prisma.incident.create({
      data: {
        type,
        createdBy: IncidentBy.SYSTEM,
        admitted: false,
        userId,
        membershipId,
        companyId,
        branchId,
        recordId,
        occurredAt: recordCreatedAt,
        expectedAt: evaluation.expectedTime
          ? this.buildExpectedDate(recordCreatedAt, evaluation.expectedTime)
          : null,
      },
    });
  }

  /* ====================================================== */

  private buildExpectedDate(baseDate: Date, time: string) {
    const [h, m] = time.split(':').map(Number);
    const d = new Date(baseDate);
    d.setHours(h, m, 0, 0);
    return d;
  }

  private timeToMinutes(time: string) {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  private buildLocalDate(date: string, time: string) {
    const [year, month, day] = date.split('-').map(Number);
    const [h, m] = time.split(':').map(Number);
    return new Date(year, month - 1, day, h, m, 0, 0);
  }

  private async getActiveMembership(userId: string, companyId: string, branchId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: { userId, companyId, branchId, active: true },
    });

    if (!membership) {
      throw new BadRequestException('Usuario no pertenece a esta sucursal');
    }

    return membership;
  }

  private async getLastRecord(membershipId: string) {
    return this.prisma.record.findFirst({
      where: { membershipId },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async createRecord(data: any) {
    return this.prisma.record.create({
      data: {
        type: data.type,
        user: { connect: { id: data.userId } },
        company: { connect: { id: data.companyId } },
        branch: { connect: { id: data.branchId } },
        membership: { connect: { id: data.membershipId } },
      },
    });
  }
}