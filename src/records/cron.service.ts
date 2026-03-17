import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class CronService {

    constructor(
        private readonly prisma: PrismaService,
        private readonly notificationsService: NotificationsService,
    ) {
        console.log('🔥 CronService INSTANCIADO');
    }

    /* ======================================================
       ⏱ CRON REAL (cada 5 minutos)
    ====================================================== */
    /*
    @Cron('* * * * *') // ✅ CORRECTO
    async checkForgotIn() {

        console.log('🚨 CRON FUNCTION TRIGGERED');

        const now = new Date();
        console.log('🕒 NOW:', now.toISOString());

        const schedules = await this.prisma.schedule.findMany({
            where: {
                validFrom: { lte: now },
                OR: [{ validTo: null }, { validTo: { gte: now } }],
            },
            include: {
                shifts: true,
            },
        });

        for (const schedule of schedules) {

            const userId = schedule.userId;
            const branchId = schedule.branchId;

            const weekday = now.getDay() === 0 ? 7 : now.getDay();

            const shiftsToday = schedule.shifts.filter(
                s => s.weekday === weekday,
            );

            for (const shift of shiftsToday) {

                const [h, m] = shift.startTime.split(':').map(Number);

                const start = new Date(now);
                start.setHours(h, m, 0, 0);

                const diffMinutes = (now.getTime() - start.getTime()) / 60000;

                // 🔴 CLAVE ABSOLUTA
                // ignorar turnos antiguos (más de 2h)
                if (diffMinutes > 120) continue;

                // ⏳ aún no toca
                if (diffMinutes < 15) continue;

                // 2️⃣ comprobar si ya tiene IN cercano al turno
                const hasIn = await this.prisma.record.findFirst({
                    where: {
                        userId,
                        type: 'IN',
                        createdAt: {
                            gte: new Date(start.getTime() - 60 * 60000), // 1h antes
                            lte: new Date(start.getTime() + 60 * 60000), // 1h después
                        },
                    },
                });

                if (hasIn) continue;

                // 3️⃣ comprobar si ya se preguntó
                const alreadyAsked = await this.prisma.incident.findFirst({
                    where: {
                        userId,
                        type: 'FORGOT_IN',
                        occurredAt: {
                            gte: start,
                        },
                    },
                });

                if (alreadyAsked) continue;

                console.log('🔥 ENVIANDO FORGOT_IN →', userId);

                await this.notificationsService.sendToUser(userId, {
                    title: 'TIMEO',
                    body: 'Tu horario comenzó hace 15 minutos. ¿Estás trabajando?',
                });
                const membership = await this.prisma.membership.findFirst({
                    where: {
                        userId,
                        branchId,
                        active: true,
                    },
                });
                // ✅ MARCAR
                await this.prisma.incident.create({
                    data: {
                        type: 'FORGOT_IN',
                        createdBy: 'SYSTEM',
                        admitted: false,
                        occurredAt: now,

                        user: {
                            connect: { id: userId },
                        },

                        branch: {
                            connect: { id: branchId },
                        },

                        company: {
                            connect: { id: membership.companyId }, // ✅ AQUÍ
                        },

                        membership: {
                            connect: { id: membership.id }, // ✅ CLAVE REAL
                        },
                    },
                });
            }
        }

        console.log('🧠 CRON END');
    }*/
}