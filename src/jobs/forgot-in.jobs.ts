import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  IncidentType,
  IncidentBy,
} from '@prisma/client';
import { SchedulesService } from '../schedules/schedules.service';

@Injectable()
export class ForgotInJob {
  constructor(
    private prisma: PrismaService,
    private schedulesService: SchedulesService,
  ) {}

  /* ======================================================
     EJECUCIÓN DEL JOB
     - Se lanza cada 15 minutos
  ====================================================== */
  async run(now: Date = new Date()) {
    // 1️⃣ Obtener empleados con horario activo
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
     EVALUAR UN HORARIO CONCRETO
  ====================================================== */
  private async evaluateSchedule(schedule: any, now: Date) {
    const jsDay = now.getDay(); // 0 = domingo
    const weekday = jsDay === 0 ? 7 : jsDay;

    const shift = schedule.shifts.find(
      (s: any) => s.weekday === weekday,
    );

    if (!shift) return; // No trabaja hoy

    // Hora esperada de entrada
    const expectedIn = new Date(now);
    const [hIn, mIn] = shift.startTime.split(':').map(Number);
    expectedIn.setHours(hIn, mIn, 0, 0);

    // Hora esperada de salida
    const expectedOut = new Date(now);
    const [hOut, mOut] = shift.endTime.split(':').map(Number);
    expectedOut.setHours(hOut, mOut, 0, 0);

    // Membership
    const membership = await this.prisma.membership.findFirst({
      where: {
        userId: schedule.userId,
        branchId: schedule.branchId,
        active: true,
      },
    });

    if (!membership) return;

    // ¿Hay algún IN hoy?
    const inRecord = await this.prisma.record.findFirst({
      where: {
        membershipId: membership.id,
        type: 'IN',
        createdAt: {
          gte: expectedIn,
          lte: expectedOut,
        },
      },
    });

    // =========================
    // A) FORGOT_IN (15 min)
    // =========================
    if (
      now.getTime() >= expectedIn.getTime() + 15 * 60_000 &&
      !inRecord
    ) {
      const existing = await this.prisma.incident.findFirst({
        where: {
          membershipId: membership.id,
          type: {
            in: [
              IncidentType.FORGOT_IN,
              IncidentType.IN_LATE,
              IncidentType.NO_SHOW,
            ],
          },
          occurredAt: {
            gte: expectedIn,
          },
        },
      });

      if (!existing) {
        await this.prisma.incident.create({
          data: {
            type: IncidentType.FORGOT_IN,
            createdBy: IncidentBy.SYSTEM,
            admitted: false,
            expectedAt: expectedIn,
            occurredAt: now,
            userId: schedule.userId,
            membershipId: membership.id,
            companyId: membership.companyId,
            branchId: schedule.branchId,
          },
        });
      }
    }

    // =========================
    // B) NO_SHOW (fin de turno)
    // =========================
    if (
      now.getTime() >= expectedOut.getTime() &&
      !inRecord
    ) {
      const noShowExists = await this.prisma.incident.findFirst({
        where: {
          membershipId: membership.id,
          type: IncidentType.NO_SHOW,
          occurredAt: {
            gte: expectedIn,
          },
        },
      });

      if (!noShowExists) {
        // Eliminar IN_LATE (excluyente)
        await this.prisma.incident.deleteMany({
          where: {
            membershipId: membership.id,
            type: IncidentType.IN_LATE,
          },
        });

        await this.prisma.incident.create({
          data: {
            type: IncidentType.NO_SHOW,
            createdBy: IncidentBy.SYSTEM,
            admitted: false,
            occurredAt: now,
            userId: schedule.userId,
            membershipId: membership.id,
            companyId: membership.companyId,
            branchId: schedule.branchId,
          },
        });
      }
    }
  }
}