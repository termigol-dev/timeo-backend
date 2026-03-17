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
     ⏱ CRON TEST (cada minuto temporal)
  ====================================================== */

  @Cron('* * * * *')
  async checkForgotIn() {

    console.log('🚨 CRON FUNCTION TRIGGERED');

    const now = new Date();
    console.log('🕒 NOW:', now.toISOString());

    // 1️⃣ usuarios con horario activo
    const schedules = await this.prisma.schedule.findMany({
      where: {
        validFrom: { lte: now },
        OR: [{ validTo: null }, { validTo: { gte: now } }],
      },
      include: {
        shifts: true,
        user: true,
      },
    });

    console.log('📦 SCHEDULES FOUND:', schedules.length);

    for (const schedule of schedules) {

      const userId = schedule.userId;
      const branchId = schedule.branchId;

      console.log('👤 USER:', userId, 'BRANCH:', branchId);

      const weekday = now.getDay() === 0 ? 7 : now.getDay();
      console.log('📅 WEEKDAY:', weekday);

      const shiftsToday = schedule.shifts.filter(
        s => s.weekday === weekday,
      );

      console.log('📊 SHIFTS TODAY:', shiftsToday.length);

      for (const shift of shiftsToday) {

        console.log('🕒 SHIFT START:', shift.startTime);

        const [h, m] = shift.startTime.split(':').map(Number);

        const start = new Date(now);
        start.setHours(h, m, 0, 0);

        console.log('⏱ START TIME:', start.toISOString());

        const diffMinutes = (now.getTime() - start.getTime()) / 60000;

        console.log('⏳ DIFF MINUTES:', diffMinutes);

        // ⏳ +15 min desde inicio
        if (diffMinutes < 15) {
          console.log('⛔ NO HAN PASADO 15 MIN');
          continue;
        }

        console.log('✅ PASAN +15 MIN');

        // 2️⃣ comprobar si ya tiene IN hoy
        const hasIn = await this.prisma.record.findFirst({
          where: {
            userId,
            type: 'IN',
            createdAt: {
              gte: start,
            },
          },
        });

        console.log('📌 HAS IN:', !!hasIn);

        if (hasIn) {
          console.log('⛔ YA TIENE IN');
          continue;
        }

        // 3️⃣ comprobar si ya se lanzó FORGOT_IN
        const alreadyAsked = await this.prisma.incident.findFirst({
          where: {
            userId,
            type: 'FORGOT_IN',
            occurredAt: {
              gte: start,
            },
          },
        });

        console.log('📌 ALREADY ASKED:', !!alreadyAsked);

        if (alreadyAsked) {
          console.log('⛔ YA EXISTE FORGOT_IN');
          continue;
        }

        console.log('🔥 CONDITIONS MET → ENVIANDO PUSH A:', userId);

        // 🚀 enviar push
        await this.notificationsService.sendToUser(userId, {
          title: 'TIMEO',
          body: 'Tu horario comenzó hace 15 minutos. ¿Estás trabajando?',
        });

      }
    }

    console.log('🧠 CRON END');
  }
}