// src/jobs/forgot-out-3h.job.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IncidentType } from '@prisma/client';

@Injectable()
export class ForgotOut3hJob {
  constructor(private prisma: PrismaService) {}

  async run() {
    const threeHoursAgo = new Date(
      Date.now() - 3 * 60 * 60 * 1000,
    );

    // 1️⃣ Buscar OUT_LATE antiguos
    const outLates = await this.prisma.incident.findMany({
      where: {
        type: IncidentType.OUT_LATE,
        expectedAt: { lte: threeHoursAgo },
      },
      include: {
        membership: true,
      },
    });

    for (const outLate of outLates) {
      // 2️⃣ ¿Existe ya un FORGOT_OUT para esta membership después?
      const existingForgotOut =
        await this.prisma.incident.findFirst({
          where: {
            type: IncidentType.FORGOT_OUT,
            membershipId: outLate.membershipId,
            occurredAt: { gt: outLate.occurredAt },
          },
        });

      if (existingForgotOut) continue;

      // 3️⃣ ¿Existe OUT manual posterior?
      const hasOut = await this.prisma.record.findFirst({
        where: {
          membershipId: outLate.membershipId,
          type: 'OUT',
          createdAt: { gt: outLate.expectedAt! },
        },
      });

      if (hasOut) continue;

      // 4️⃣ Aquí:
      // - se lanza notificación
      // - se queda esperando respondToIncident(...)
    }
  }
}