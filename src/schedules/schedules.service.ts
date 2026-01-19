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
  constructor(private prisma: PrismaService) { }

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

    // 1️⃣ Obtener turnos existentes de ese día
    const existingShifts = await this.prisma.shift.findMany({
      where: {
        scheduleId,
        weekday: data.weekday,
      },
    });

    // 2️⃣ Comprobar solapes
    const hasOverlap = existingShifts.some(shift => {
      return (
        data.startTime < shift.endTime &&
        data.endTime > shift.startTime
      );
    });

    if (hasOverlap) {
      throw new BadRequestException(
        'El turno se solapa con uno existente',
      );
    }

    // 3️⃣ Crear turno si todo está limpio
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

  /* ======================================================
   ELIMINAR TURNOS (SEGÚN CONTEXTO)
====================================================== */
  async deleteShifts(
    scheduleId: string,
    body: {
      source: 'PANEL' | 'CALENDAR';
      mode: 'ONLY_THIS_BLOCK' | 'FROM_THIS_DAY_ON' | 'RANGE';
      dateFrom?: string;
      dateTo?: string;
      startTime?: string;
      endTime?: string;
      shiftId?: string;
    },
  ) {
    const {
      mode,
      dateFrom,
      dateTo,
      startTime,
      endTime,
      shiftId,
    } = body;

    // 🧱 VALIDACIONES BÁSICAS
    if (startTime && endTime && startTime >= endTime) {
      throw new BadRequestException(
        'La hora de inicio debe ser anterior a la de fin',
      );
    }

    // =========================
    // CASO 1 — SOLO ESTE BLOQUE (por rango horario + día)
    // =========================
    if (mode === 'ONLY_THIS_BLOCK') {
      if (!dateFrom || !startTime || !endTime) {
        throw new BadRequestException(
          'dateFrom, startTime y endTime son obligatorios',
        );
      }

      const baseDate = new Date(dateFrom);
      const jsDay = baseDate.getDay(); // 0 = domingo
      const weekday = jsDay === 0 ? 7 : jsDay;

      return this.prisma.shift.deleteMany({
        where: {
          scheduleId,
          weekday,
          startTime: { gte: startTime },
          endTime: { lte: endTime },
        },
      });
    }

    // =========================
    // CALCULAR FECHAS
    // =========================
    const fromDate = dateFrom ? new Date(dateFrom) : new Date();
    const toDate = dateTo ? new Date(dateTo) : null;

    if (toDate && fromDate > toDate) {
      throw new BadRequestException('dateFrom no puede ser posterior a dateTo');
    }

    // =========================
    // CALCULAR WEEKDAYS AFECTADOS
    // =========================
    const weekdays = new Set<number>();
    const cursor = new Date(fromDate);

    while (!toDate || cursor <= toDate) {
      const jsDay = cursor.getDay(); // 0 = domingo
      const weekday = jsDay === 0 ? 7 : jsDay;
      weekdays.add(weekday);

      cursor.setDate(cursor.getDate() + 1);
      if (!toDate) break; // FROM_THIS_DAY_ON
    }

    // =========================
    // BORRADO MASIVO
    // =========================
    return this.prisma.shift.deleteMany({
      where: {
        scheduleId,
        weekday: { in: [...weekdays] },
        ...(startTime && { startTime: { gte: startTime } }),
        ...(endTime && { endTime: { lte: endTime } }),
      },
    });
  }

  /* ======================================================
   ELIMINAR VACACIONES
   - single: solo ese día
   - forward: desde ese día en adelante (máx +2 años)
====================================================== */
  async deleteVacation(
    scheduleId: string,
    date: string,
    mode: 'single' | 'forward',
  ) {
    const schedule = await this.prisma.schedule.findUnique({
      where: { id: scheduleId },
    });

    if (!schedule) {
      throw new NotFoundException('Horario no encontrado');
    }

    const fromDate = new Date(date);
    fromDate.setHours(0, 0, 0, 0);

    if (mode === 'single') {
      return this.prisma.scheduleException.deleteMany({
        where: {
          scheduleId,
          type: 'VACATION',
          date: fromDate,
        },
      });
    }

    // mode === 'forward'
    const toDate = new Date(fromDate);
    toDate.setFullYear(toDate.getFullYear() + 2);

    return this.prisma.scheduleException.deleteMany({
      where: {
        scheduleId,
        type: 'VACATION',
        date: {
          gte: fromDate,
          lte: toDate,
        },
      },
    });
  }
}