// src/jobs/no-show.job.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IncidentType, IncidentBy } from '@prisma/client';

@Injectable()
export class NoShowJob {
  constructor(private prisma: PrismaService) {}

  async run() {
    const now = new Date();

    // 1️⃣ Horarios activos
    const schedules = await this.prisma.schedule.findMany({
      where: {
        validFrom: { lte: now },
        OR: [{ validTo: null }, { validTo: { gte: now } }],
      },
      include: { shifts: true },
    });

    for (const schedule of schedules) {
      for (const shift of schedule.shifts) {
        // 2️⃣ Calcular fin del turno de HOY
        const shiftEnd = new Date(now);
        const [h, m] = shift.endTime.split(':').map(Number);
        shiftEnd.setHours(h, m, 0, 0);

        if (shiftEnd > now) continue;

        // 3️⃣ Membership activa
        const membership = await this.prisma.membership.findFirst({
          where: {
            userId: schedule.userId,
            branchId: schedule.branchId,
            active: true,
          },
        });

        if (!membership) continue;

        // 4️⃣ ¿Hubo algún IN hoy?
        const hasIn = await this.prisma.record.findFirst({
          where: {
            membershipId: membership.id,
            type: 'IN',
            createdAt: {
              gte: new Date(
                shiftEnd.getFullYear(),
                shiftEnd.getMonth(),
                shiftEnd.getDate(),
                0, 0, 0,
              ),
              lte: shiftEnd,
            },
          },
        });

        if (hasIn) continue;

        // 5️⃣ ¿Ya existe NO_SHOW?
        const existingNoShow = await this.prisma.incident.findFirst({
          where: {
            type: IncidentType.NO_SHOW,
            membershipId: membership.id,
            expectedAt: shiftEnd,
          },
        });

        if (existingNoShow) continue;

        // 6️⃣ Crear NO_SHOW
        await this.prisma.incident.create({
          data: {
            type: IncidentType.NO_SHOW,
            createdBy: IncidentBy.SYSTEM,
            admitted: false,
            expectedAt: shiftEnd,
            occurredAt: now,

            user: { connect: { id: schedule.userId } },
            membership: { connect: { id: membership.id } },
            company: { connect: { id: membership.companyId } },
            branch: { connect: { id: schedule.branchId } },
          },
        });

        // 7️⃣ Eliminar IN_LATE (excluyentes)
        await this.prisma.incident.deleteMany({
          where: {
            membershipId: membership.id,
            type: IncidentType.IN_LATE,
          },
        });
      }
    }
  }
}