import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  IncidentType,
  IncidentBy,
} from '@prisma/client';
import { SchedulesService } from '../schedules/schedules.service';

@Injectable()
export class OutLateJob {
  constructor(
    private prisma: PrismaService,
    private schedulesService: SchedulesService,
  ) {}

  /* ======================================================
     EJECUCIÓN DEL JOB
     - Cada 15 minutos
  ====================================================== */
  async run(now: Date = new Date()) {
    const schedules = await this.prisma.schedule.findMany({
      where: {
        validFrom: { lte: now },
        OR: [{ validTo: null }, { validTo: { gte: now } }],
      },
      include: {
        shifts: true,
        user: true,
        branch: true,
      },
    });

    for (const schedule of schedules) {
      await this.evaluateSchedule(schedule, now);
    }
  }

  /* ======================================================
     EVALUAR UN HORARIO
  ====================================================== */
  private async evaluateSchedule(schedule: any, now: Date) {
    const jsDay = now.getDay();
    const weekday = jsDay === 0 ? 7 : jsDay;

    const shift = schedule.shifts.find(
      (s: any) => s.weekday === weekday,
    );

    if (!shift) return;

    const expectedOut = new Date(now);
    const [h, m] = shift.endTime.split(':').map(Number);
    expectedOut.setHours(h, m, 0, 0);

    // Membership activa
    const membership = await this.prisma.membership.findFirst({
      where: {
        userId: schedule.userId,
        branchId: schedule.branchId,
        active: true,
      },
    });

    if (!membership) return;

    // ¿Hay OUT ya?
    const outRecord = await this.prisma.record.findFirst({
      where: {
        membershipId: membership.id,
        type: 'OUT',
        createdAt: {
          gte: expectedOut,
        },
      },
    });

    if (outRecord) return;

    // ¿Han pasado 15 minutos?
    if (now.getTime() < expectedOut.getTime() + 15 * 60_000) {
      return;
    }

    // ¿Ya existe OUT_LATE hoy?
    const existing = await this.prisma.incident.findFirst({
      where: {
        membershipId: membership.id,
        type: IncidentType.OUT_LATE,
        occurredAt: {
          gte: expectedOut,
        },
      },
    });

    if (existing) return;

    // ✅ Crear OUT_LATE
    await this.prisma.incident.create({
      data: {
        type: IncidentType.OUT_LATE,
        createdBy: IncidentBy.SYSTEM,
        admitted: false,
        expectedAt: expectedOut,
        occurredAt: now,
        userId: schedule.userId,
        membershipId: membership.id,
        companyId: membership.companyId,
        branchId: schedule.branchId,
      },
    });
  }
}