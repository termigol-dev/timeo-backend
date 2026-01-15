import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';


/**
 * Servicio de HORARIOS
 *
 * PRINCIPIO CLAVE:
 * Este servicio SOLO responde a una pregunta:
 *
 * 👉 ¿Este usuario tenía que trabajar en esta fecha y hora?
 *
 * NO interpreta incidencias
 * NO crea registros
 * NO toma decisiones disciplinarias
 */
@Injectable()
export class SchedulesService {
  constructor(private prisma: PrismaService) {}

  /* ======================================================
     CREAR HORARIO EN BORRADOR
  ====================================================== */
  async createDraftSchedule(
    companyId: string,
    branchId: string,
    userId: string,
    admin: any,
  ) {
    if (
      ![Role.SUPERADMIN, Role.ADMIN_EMPRESA, Role.ADMIN_SUCURSAL].includes(
        admin.role,
      )
    ) {
      throw new ForbiddenException();
    }

    const membership = await this.prisma.membership.findFirst({
      where: {
        userId,
        companyId,
        active: true,
      },
    });

    if (!membership) {
      throw new BadRequestException(
        'El usuario no pertenece a esta empresa',
      );
    }

    return this.prisma.schedule.create({
      data: {
        userId,
        branchId,
        validFrom: new Date(), // se ajusta al confirmar
      },
      include: { shifts: true },
    });
  }

  /* ======================================================
     AÑADIR TURNO (BORRADOR)
  ====================================================== */
  async addShiftToSchedule(
    scheduleId: string,
    data: {
      weekday: number; // 1 = lunes ... 7 = domingo
      startTime: string;
      endTime: string;
    },
  ) {
    if (data.weekday < 1 || data.weekday > 7) {
      throw new BadRequestException('Día inválido');
    }

    if (data.startTime >= data.endTime) {
      throw new BadRequestException(
        'La hora de inicio debe ser anterior a la de fin',
      );
    }

    return this.prisma.shift.create({
      data: {
        scheduleId,
        weekday: data.weekday,
        startTime: data.startTime,
        endTime: data.endTime,
      },
    });
  }

/* ======================================================
     AÑADIR VACACIONES (BORRADOR)
  ====================================================== */
async addVacation(
  requestUser: any,
  scheduleId: string,
  body: { date: string },
) {
  const schedule = await this.prisma.schedule.findUnique({
    where: { id: scheduleId },
  });

  if (!schedule) {
    throw new NotFoundException('Horario no encontrado');
  }

  const date = new Date(body.date);

  // ⛔ EVITAR DUPLICADOS
  const existing = await this.prisma.scheduleException.findFirst({
    where: {
      scheduleId,
      date,
      type: 'VACATION',
    },
  });

  if (existing) {
    // 👌 idempotente: no error, no duplicado
    return existing;
  }

  return this.prisma.scheduleException.create({
    data: {
      scheduleId,
      date,
      startTime: null,
      endTime: null,
      type: 'VACATION',
    },
  });
}
  /* ======================================================
     ELIMINAR TURNO (BORRADOR)
  ====================================================== */
  async removeShift(shiftId: string) {
    return this.prisma.shift.delete({
      where: { id: shiftId },
    });
  }

  /* ======================================================
     CALCULAR HORAS SEMANALES (PREVISUALIZACIÓN)
  ====================================================== */
  async calculateWeeklyHours(scheduleId: string) {
    const shifts = await this.prisma.shift.findMany({
      where: { scheduleId },
    });

    let totalMinutes = 0;

    for (const shift of shifts) {
      const [sh, sm] = shift.startTime.split(':').map(Number);
      const [eh, em] = shift.endTime.split(':').map(Number);

      totalMinutes += eh * 60 + em - (sh * 60 + sm);
    }

    return {
      hours: Math.floor(totalMinutes / 60),
      minutes: totalMinutes % 60,
      totalMinutes,
    };
  }

  /* ======================================================
     CONFIRMAR HORARIO
     - Cierra horarios anteriores
     - Activa este
  ====================================================== */
  async confirmSchedule(scheduleId: string) {
    const schedule = await this.prisma.schedule.findUnique({
      where: { id: scheduleId },
      include: { shifts: true },
    });

    if (!schedule) {
      throw new NotFoundException('Horario no encontrado');
    }

    /*if (schedule.shifts.length === 0) {
      throw new BadRequestException(
        'El horario no tiene turnos',
      );
    }*/

    await this.prisma.schedule.updateMany({
      where: {
        userId: schedule.userId,
        validTo: null,
        NOT: { id: schedule.id },
      },
      data: { validTo: new Date() },
    });

    return this.prisma.schedule.update({
      where: { id: schedule.id },
      data: {
        validFrom: new Date(),
        validTo: null,
      },
    });
  }

  /* ======================================================
     OBTENER HORARIO ACTIVO
  ====================================================== */
  async getActiveSchedule(userId: string) {
    return this.prisma.schedule.findFirst({
  where: {
    userId,
    validFrom: { lte: new Date() },
    OR: [
      { validTo: null },
      { validTo: { gte: new Date() } },
    ],
  },
  include: {
    shifts: true,
    exceptions: true, // 👈 ESTO ES LO QUE FALTABA
  },
});
  }

  /* ======================================================
     🔑 MÉTODO CLAVE DEL SISTEMA
     ¿Tenía que trabajar este usuario en esta fecha?
  ====================================================== */
  async getExpectedShiftForDate(
    userId: string,
    branchId: string,
    date: Date,
  ): Promise<{
    weekday: number;
    startTime: string;
    endTime: string;
  } | null> {
    // 1️⃣ Buscar schedule válido para esa fecha
    const schedule = await this.prisma.schedule.findFirst({
      where: {
        userId,
        branchId,
        validFrom: { lte: date },
        OR: [{ validTo: null }, { validTo: { gte: date } }],
      },
      include: { shifts: true },
    });

    if (!schedule) return null;

    // 2️⃣ Calcular weekday (1 = lunes, 7 = domingo)
    const jsDay = date.getDay(); // 0 = domingo
    const weekday = jsDay === 0 ? 7 : jsDay;

    // 3️⃣ Buscar turno del día
    const shift = schedule.shifts.find(
      s => s.weekday === weekday,
    );

    if (!shift) return null;

    return {
      weekday,
      startTime: shift.startTime,
      endTime: shift.endTime,
    };
  }

  /* ======================================================
     UTILIDAD PARA JOB / RECORDS
     Convierte hora "HH:mm" en Date real
  ====================================================== */
  buildDateWithTime(baseDate: Date, time: string) {
    const [h, m] = time.split(':').map(Number);
    const d = new Date(baseDate);
    d.setHours(h, m, 0, 0);
    return d;
  }
}