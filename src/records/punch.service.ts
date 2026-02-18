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
     🧠 EVALUACIÓN DE HORARIO
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

    if (!schedule) return { status: 'NO_SHIFT' };

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

      const active = enriched.find(
        s => nowMinutes >= s.startMinutes && nowMinutes <= s.endMinutes,
      );

      if (active) {
        return this.evaluateDiff(
          nowMinutes - active.startMinutes,
          active.startTime,
        );
      }

      const upcoming = enriched
        .filter(s => nowMinutes < s.startMinutes)
        .sort((a, b) => a.startMinutes - b.startMinutes)[0];

      if (upcoming) {
        return this.evaluateDiff(
          nowMinutes - upcoming.startMinutes,
          upcoming.startTime,
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
     🎯 INCIDENCIAS (DB)
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
          ? this.buildExpectedDate(
              recordCreatedAt,
              evaluation.expectedTime,
            )
          : null,
      },
    });
  }

  /* ======================================================
     🎯 INCIDENCIAS (SIMULADOR)
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

  /* ======================================================
     HELPERS
  ====================================================== */

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
}