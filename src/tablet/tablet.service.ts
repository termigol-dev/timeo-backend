import {
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  RecordType,
  IncidentType,
  IncidentBy,
} from '@prisma/client';

type ScheduleEvaluation = {
  status: 'OK' | 'EARLY' | 'LATE' | 'NO_SHIFT';
  expectedTime?: string; // "09:00"
  diffMinutes?: number;
};

@Injectable()
export class TabletService {
  constructor(private readonly prisma: PrismaService) {}

  /* ======================================================
     EMPLEADOS DE LA TABLET
  ====================================================== */
  async getEmployees(branchId: string) {
    return this.prisma.membership.findMany({
      where: {
        branchId,
        active: true,
        user: { active: true },
      },
      include: {
        user: {
          include: {
            records: {
              take: 1,
              orderBy: { createdAt: 'desc' },
            },
          },
        },
      },
      orderBy: {
        user: { firstSurname: 'asc' },
      },
    });
  }

  /* ======================================================
     ENTRADA (IN)
  ====================================================== */
  async recordIn(
    userId: string,
    branchId: string,
    companyId: string,
  ) {
    const membership = await this.getActiveMembership(
      userId,
      companyId,
      branchId,
    );

    const lastRecord = await this.getLastRecord(
      membership.id,
    );

    if (lastRecord?.type === RecordType.IN) {
      throw new BadRequestException('Already IN');
    }

    const evaluation = await this.evaluateSchedule({
      userId,
      branchId,
      date: new Date(),
      type: RecordType.IN,
    });

    const record = await this.createRecord({
      type: RecordType.IN,
      userId,
      companyId,
      branchId,
      membershipId: membership.id,
    });

    await this.handleIncidentFromEvaluation({
      evaluation,
      recordType: RecordType.IN,
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
     SALIDA (OUT)
  ====================================================== */
  async recordOut(
    userId: string,
    branchId: string,
    companyId: string,
  ) {
    const membership = await this.getActiveMembership(
      userId,
      companyId,
      branchId,
    );

    const lastRecord = await this.getLastRecord(
      membership.id,
    );

    if (!lastRecord || lastRecord.type === RecordType.OUT) {
      throw new BadRequestException('No active IN');
    }

    const evaluation = await this.evaluateSchedule({
      userId,
      branchId,
      date: new Date(),
      type: RecordType.OUT,
    });

    const record = await this.createRecord({
      type: RecordType.OUT,
      userId,
      companyId,
      branchId,
      membershipId: membership.id,
    });

    await this.handleIncidentFromEvaluation({
      evaluation,
      recordType: RecordType.OUT,
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
     🧠 EVALUACIÓN DE HORARIO (NO GUARDA)
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

    const schedule =
      await this.prisma.schedule.findFirst({
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

    const nowMinutes =
      date.getHours() * 60 + date.getMinutes();

    if (type === RecordType.IN) {
      const target = shiftsOfDay
        .map(s => ({
          ...s,
          startMinutes: this.timeToMinutes(
            s.startTime,
          ),
        }))
        .sort(
          (a, b) =>
            Math.abs(a.startMinutes - nowMinutes) -
            Math.abs(b.startMinutes - nowMinutes),
        )[0];

      return this.evaluateDiff(
        nowMinutes - target.startMinutes,
        target.startTime,
      );
    }

    const target = shiftsOfDay
      .map(s => ({
        ...s,
        endMinutes: this.timeToMinutes(s.endTime),
      }))
      .sort(
        (a, b) =>
          Math.abs(a.endMinutes - nowMinutes) -
          Math.abs(b.endMinutes - nowMinutes),
      )[0];

    return this.evaluateDiff(
      nowMinutes - target.endMinutes,
      target.endTime,
    );
  }

  /* ======================================================
     REGLAS DE TOLERANCIA ±15 min
  ====================================================== */
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
     🎯 CREAR INCIDENCIA SEGÚN EVALUACIÓN
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

  private buildExpectedDate(
    baseDate: Date,
    time: string,
  ) {
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
     HELPERS PRIVADOS
  ====================================================== */

  private async getActiveMembership(
    userId: string,
    companyId: string,
    branchId: string,
  ) {
    const membership =
      await this.prisma.membership.findFirst({
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

  private async getLastRecord(
    membershipId: string,
  ) {
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