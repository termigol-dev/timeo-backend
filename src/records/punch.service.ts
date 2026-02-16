import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  RecordType,
  IncidentType,
  IncidentBy,
} from '@prisma/client';

type ScheduleEvaluation = {
  status: 'OK' | 'EARLY' | 'LATE' | 'NO_SHIFT';
  expectedTime?: string;
  diffMinutes?: number;
};

@Injectable()
export class PunchService {

  constructor(
    private readonly prisma: PrismaService,
  ) { }

  /* ======================================================
   🧪 SIMULADOR (NO ESCRIBE EN DB)
====================================================== */

  async simulateDay(body: any) {

    const {
      userId,
      companyId,
      branchId,
      date,
      inTime,
      outTime,
    } = body;

    const events: { type: RecordType; createdAt: Date }[] = [];

    if (inTime) {
      events.push({
        type: RecordType.IN,
        createdAt: new Date(`${date}T${inTime}:00`),
      });
    }

    if (outTime) {
      events.push({
        type: RecordType.OUT,
        createdAt: new Date(`${date}T${outTime}:00`),
      });
    }

    if (events.length === 0) {
      throw new BadRequestException('No events to simulate');
    }

    const incidents = [];

    for (const event of events) {

      const evaluation = await this.evaluateSchedule({
        userId,
        branchId,
        date: event.createdAt,
        type: event.type,
      });

      const incident = this.buildIncidentFromEvaluation({
        evaluation,
        recordType: event.type,
        recordCreatedAt: event.createdAt,
        userId,
        companyId,
        branchId,
      });

      incidents.push({
        event,
        evaluation,
        incident,
      });
    }

    return {
      simulatedEvents: events,
      results: incidents,
    };
  }

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

    /* ======================================================
       🧪 DEBUG TIME (SOLO SI EXISTE VARIABLE ENV)
    ====================================================== */

    const now = process.env.DEBUG_PUNCH_TIME
      ? new Date(process.env.DEBUG_PUNCH_TIME)
      : new Date();

    /* ====================================================== */

    const evaluation = await this.evaluateSchedule({
      userId,
      branchId,
      date: now,
      type,
    });

    const record = await this.createRecord({
      type,
      userId,
      companyId,
      branchId,
      membershipId: membership.id,
    });

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
     🧠 EVALUACIÓN DE HORARIO (NUEVA LÓGICA JERÁRQUICA)
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

    if (!schedule) {
      return { status: 'NO_SHIFT' };
    }

    const shiftsOfDay = schedule.shifts.filter(
      s => s.weekday === weekday,
    );

    if (shiftsOfDay.length === 0) {
      return { status: 'NO_SHIFT' };
    }

    const nowMinutes = date.getHours() * 60 + date.getMinutes();

    const enriched = shiftsOfDay.map(s => ({
      ...s,
      startMinutes: this.timeToMinutes(s.startTime),
      endMinutes: this.timeToMinutes(s.endTime),
    }));

    /* ============================
       🔵 ENTRADA (IN)
    ============================ */
    if (type === RecordType.IN) {

      const upcoming = enriched
        .filter(s => nowMinutes <= s.startMinutes)
        .sort((a, b) => a.startMinutes - b.startMinutes)[0];

      if (upcoming) {
        return this.evaluateDiff(
          nowMinutes - upcoming.startMinutes,
          upcoming.startTime,
        );
      }

      const active = enriched.find(
        s => nowMinutes >= s.startMinutes && nowMinutes <= s.endMinutes,
      );

      if (active) {
        return this.evaluateDiff(
          nowMinutes - active.startMinutes,
          active.startTime,
        );
      }

      const lastPast = enriched
        .filter(s => nowMinutes > s.endMinutes)
        .sort((a, b) => b.endMinutes - a.endMinutes)[0];

      if (lastPast) {
        return this.evaluateDiff(
          nowMinutes - lastPast.startMinutes,
          lastPast.startTime,
        );
      }

      return { status: 'NO_SHIFT' };
    }

    /* ============================
       🔴 SALIDA (OUT)
    ============================ */

    const active = enriched.find(
      s => nowMinutes >= s.startMinutes && nowMinutes <= s.endMinutes,
    );

    if (active) {
      return this.evaluateDiff(
        nowMinutes - active.endMinutes,
        active.endTime,
      );
    }

    const justEnded = enriched
      .filter(s => nowMinutes >= s.endMinutes)
      .sort((a, b) => b.endMinutes - a.endMinutes)[0];

    if (justEnded) {
      return this.evaluateDiff(
        nowMinutes - justEnded.endMinutes,
        justEnded.endTime,
      );
    }

    const upcoming = enriched
      .filter(s => nowMinutes < s.startMinutes)
      .sort((a, b) => a.startMinutes - b.startMinutes)[0];

    if (upcoming) {
      return this.evaluateDiff(
        nowMinutes - upcoming.endMinutes,
        upcoming.endTime,
      );
    }

    return { status: 'NO_SHIFT' };
  }

  private evaluateDiff(
    diffMinutes: number,
    expectedTime: string,
  ): ScheduleEvaluation {

    if (Math.abs(diffMinutes) <= 15) {
      return { status: 'OK', expectedTime };
    }

    if (diffMinutes < -15) {
      return {
        status: 'EARLY',
        expectedTime,
        diffMinutes,
      };
    }

    return {
      status: 'LATE',
      expectedTime,
      diffMinutes,
    };
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
  }: {
    evaluation: ScheduleEvaluation;
    recordType: RecordType;
    recordId: string;
    recordCreatedAt: Date;
    userId: string;
    membershipId: string;
    companyId: string;
    branchId: string;
  }) {

    if (evaluation.status === 'OK') return;

    let type: IncidentType | null = null;

    if (evaluation.status === 'NO_SHIFT') {
      type =
        recordType === RecordType.IN
          ? IncidentType.FORGOT_IN
          : IncidentType.FORGOT_OUT;
    }

    if (evaluation.status === 'EARLY') {
      type = IncidentType.IN_EARLY;
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
          ? this.buildExpectedDate(
            recordCreatedAt,
            evaluation.expectedTime,
          )
          : null,
      },
    });
  }

  /* ======================================================
   🎯 CONSTRUCCIÓN DE INCIDENCIA (SIN DB)
====================================================== */

  private buildIncidentFromEvaluation({
    evaluation,
    recordType,
    recordCreatedAt,
    userId,
    companyId,
    branchId,
  }: {
    evaluation: ScheduleEvaluation;
    recordType: RecordType;
    recordCreatedAt: Date;
    userId: string;
    companyId: string;
    branchId: string;
  }) {

    if (evaluation.status === 'OK') return null;

    let type: IncidentType | null = null;

    if (evaluation.status === 'NO_SHIFT') {
      type =
        recordType === RecordType.IN
          ? IncidentType.FORGOT_IN
          : IncidentType.FORGOT_OUT;
    }

    if (evaluation.status === 'EARLY') {
      type = IncidentType.IN_EARLY;
    }

    if (evaluation.status === 'LATE') {
      type =
        recordType === RecordType.IN
          ? IncidentType.IN_LATE
          : IncidentType.OUT_LATE;
    }

    if (!type) return null;

    return {
      type,
      userId,
      companyId,
      branchId,
      occurredAt: recordCreatedAt,
      expectedAt: evaluation.expectedTime
        ? this.buildExpectedDate(
          recordCreatedAt,
          evaluation.expectedTime,
        )
        : null,
      diffMinutes: evaluation.diffMinutes ?? null,
    };
  }

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

  /* ======================================================
     HELPERS
  ====================================================== */


  private async getActiveMembership(
    userId: string,
    companyId: string,
    branchId: string,
  ) {

    const membership = await this.prisma.membership.findFirst({
      where: {
        userId,
        companyId,
        branchId,
        active: true,
      },
    });

    if (!membership) {
      throw new BadRequestException(
        'Usuario no pertenece a esta sucursal',
      );
    }

    return membership;
  }

  private async getLastRecord(membershipId: string) {

    return this.prisma.record.findFirst({
      where: { membershipId },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async createRecord(data: {
    type: RecordType;
    userId: string;
    companyId: string;
    branchId: string;
    membershipId: string;
  }) {

    return this.prisma.record.create({
      data: {
        type: data.type,
        user: { connect: { id: data.userId } },
        company: { connect: { id: data.companyId } },
        branch: { connect: { id: data.branchId } },
        membership: {
          connect: { id: data.membershipId },
        },
      },
    });
  }
}