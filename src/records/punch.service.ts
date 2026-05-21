import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  RecordType,
  IncidentType,
  IncidentBy,
} from '@prisma/client';
import { DateTime } from 'luxon';

@Injectable()
export class PunchService {

  constructor(private readonly prisma: PrismaService) { }

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

    // 🔥 VALIDACIÓN CLARA
    if (!branchId) {
      throw new BadRequestException(
        'No puedes fichar porque no tienes una sucursal asignada. Contacta con tu administrador.'
      );
    }

    const membership = await this.getActiveMembership(userId, companyId, branchId);

    const lastRecord = await this.getLastRecord(membership.id);

    console.log('🔥 USING punchService 1');

    if (type === RecordType.IN && lastRecord?.type === RecordType.IN) {
      throw new BadRequestException('Already IN');
    }

    if (type === RecordType.OUT && (!lastRecord || lastRecord.type === RecordType.OUT)) {
      throw new BadRequestException('No active IN');
    }

    // 📝 CREAR RECORD
    const record = await this.createRecord({
      type,
      userId,
      companyId,
      branchId,
      membershipId: membership.id,
    });
    console.log('✅ RECORD CREADO', record.id);
    // 🧠 EVALUAR (NUEVA LÓGICA)
    let incidentType = null;

    try {

      incidentType = await this.evaluateSchedule({
        userId,
        branchId,
        date: record.createdAt,
        type,
      });

      console.log('🧠 INCIDENT TYPE:', incidentType);

    } catch (error) {

      console.error(
        '❌ ERROR EN evaluateSchedule',
        error,
      );
    }

    // 🎯 CREAR INCIDENCIA
    if (incidentType) {
      await this.prisma.incident.create({
        data: {
          type: incidentType,
          createdBy: IncidentBy.SYSTEM,
          admitted: false,
          userId,
          membershipId: membership.id,
          companyId,
          branchId,
          recordId: record.id,
          occurredAt: record.createdAt,
        },
      });
    }

    return record;
  }

  /* ======================================================
   🧠 CORE — LÓGICA DEFINITIVA
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
  }): Promise<IncidentType | null> {

    const schedule = await this.prisma.schedule.findFirst({
      where: {
        userId,
        branchId,
        validFrom: { lte: date },
        OR: [{ validTo: null }, { validTo: { gte: date } }],
      },
      include: { shifts: true },
    });

    if (!schedule || schedule.shifts.length === 0) {
      return type === RecordType.IN ? IncidentType.IN_EARLY : null;
    }

    const now = date.getTime();

    const shifts = schedule.shifts.map(s => {
      const shiftStart = this.buildShiftDate(date, s.weekday, s.startTime);
      const shiftEnd = this.buildShiftDate(date, s.weekday, s.endTime);

      return {
        ...s,
        start: shiftStart.getTime(),
        end: shiftEnd.getTime(),
      };
    });

    /* ============================
       🟦 IN
    ============================ */

    if (type === RecordType.IN) {

      const validShifts = shifts.filter(s => now <= s.end + 15 * 60 * 1000);

      const target = validShifts.length
        ? this.getClosestByStart(validShifts, now)
        : this.getNextShift(shifts, now);

      const diff = (now - target.start) / 60000;

      if (diff < -15) return IncidentType.IN_EARLY;
      if (diff > 15) return IncidentType.IN_LATE;

      return null;
    }

    /* ============================
       🟥 OUT
    ============================ */

    if (type === RecordType.OUT) {

      const lastIn = await this.prisma.record.findFirst({
        where: {
          userId,
          branchId,
          type: RecordType.IN,
          createdAt: { lte: date },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!lastIn) return null;

      const inTime = lastIn.createdAt.getTime();

      /* ===== TURNO DEL IN ===== */

      const validShiftsForIn = shifts.filter(s => inTime <= s.end + 15 * 60 * 1000);

      const previousShift = validShiftsForIn.length
        ? this.getClosestByStart(validShiftsForIn, inTime)
        : this.getNextShift(shifts, inTime);

      if (!previousShift) return null;

      if (now < previousShift.start) return null;

      /* ===== TURNO ACTUAL ===== */

      const validCurrentShifts = shifts.filter(s => now <= s.end + 15 * 60 * 1000);

      const currentShift = validCurrentShifts.length
        ? this.getClosestByStart(validCurrentShifts, now)
        : null;

      /* ===== DECISIÓN ===== */

      let targetShift = previousShift;
      let isBrokenFlow = false;

      if (currentShift && currentShift.start !== previousShift.start) {

        const distPrev = Math.abs(now - previousShift.end);
        const distCurr = Math.abs(now - currentShift.end);

        const afterStartPlus15 = now >= currentShift.start + 15 * 60 * 1000;

        if (afterStartPlus15) {
          targetShift = currentShift;
          isBrokenFlow = true;
        } else {
          if (distCurr < distPrev) {
            targetShift = currentShift;
            isBrokenFlow = true;
          } else {
            targetShift = previousShift;
          }
        }
      }

      /* ===== EVALUACIÓN ===== */

      const diff = (now - targetShift.end) / 60000;

      if (isBrokenFlow && diff >= -15 && diff < 15) {
        return IncidentType.FORGOT_OUT;
      }

      if (diff < -15) return IncidentType.OUT_EARLY;
      if (diff >= 15) return IncidentType.OUT_LATE;

      return null;
    }

    return null;
  }

  /* ====================================================== */

  private getClosestByStart(shifts, now) {
    return shifts.sort((a, b) =>
      Math.abs(now - a.start) - Math.abs(now - b.start)
    )[0];
  }

  private getNextShift(shifts, now) {
    return shifts
      .filter(s => s.start > now)
      .sort((a, b) => a.start - b.start)[0];
  }

  private buildShiftDate(baseDate: Date, weekday: number, time: string) {

    const zone = 'Europe/Madrid';

    const base = DateTime.fromJSDate(baseDate, { zone });

    const currentDay = base.weekday;

    let diff = weekday - currentDay;
    if (diff < 0) diff += 7;

    const [h, m] = time.split(':').map(Number);

    return base
      .plus({ days: diff })
      .set({ hour: h, minute: m, second: 0, millisecond: 0 })
      .toJSDate();
  }

  private async getActiveMembership(userId: string, companyId: string, branchId: string) {

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
        'Usuario no pertenece a esta sucursal'
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