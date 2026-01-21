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
      weekday: number;      // 1 = lunes ... 7 = domingo
      startTime: string;
      endTime: string;
      validFrom: string;   // fecha inicio (YYYY-MM-DD)
      validTo?: string;   // fecha fin o null
    },
  ) {
    try {
      console.log('🟡 ADD SHIFT SERVICE INPUT:', {
        scheduleId,
        data,
      });

      const { weekday, startTime, endTime, validFrom, validTo } = data;

      // =========================
      // VALIDACIONES BÁSICAS
      // =========================

      if (weekday < 1 || weekday > 7) {
        throw new BadRequestException('Día inválido');
      }

      if (!startTime || !endTime) {
        throw new BadRequestException('Horas inválidas');
      }

      if (startTime >= endTime) {
        throw new BadRequestException(
          'La hora de inicio debe ser anterior a la de fin',
        );
      }

      if (!validFrom) {
        throw new BadRequestException('validFrom es obligatorio');
      }

      const fromDate = new Date(validFrom);
      const toDate = validTo ? new Date(validTo) : null;

      if (toDate && fromDate > toDate) {
        throw new BadRequestException(
          'La fecha de inicio no puede ser posterior a la de fin',
        );
      }

      // =========================
      // 🔒 REGLA DE ORO: NO TOCAR EL PASADO
      // =========================

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (fromDate < today) {
        throw new BadRequestException(
          'No se pueden crear o modificar turnos en el pasado',
        );
      }

      // =========================
      // BUSCAR TURNOS QUE SOLAPEN EN FECHAS (MISMO DÍA SEMANA)
      // =========================

      const existingShifts = await this.prisma.shift.findMany({
        where: {
          scheduleId,
          weekday,

          // Solape de rangos de fechas
          AND: [
            // El turno existente termina después de que empiece el nuevo
            {
              OR: [
                { validTo: null },                 // turno abierto
                { validTo: { gte: fromDate } },    // o acaba después de mi inicio
              ],
            },

            // El turno existente empieza antes de que termine el nuevo
            {
              OR: [
                { validFrom: { lte: toDate ?? undefined } }, // empieza antes de mi fin
              ],
            },
          ],
        },
      });

      // =========================
      // COMPROBAR SOLAPE HORARIO
      // =========================

      const hasOverlap = existingShifts.some(shift => {
        return (
          startTime < shift.endTime &&
          endTime > shift.startTime
        );
      });

      if (hasOverlap) {
        throw new BadRequestException(
          'El turno se solapa con uno existente en esas fechas',
        );
      }

      // =========================
      // CREAR TURNO NUEVO (NUNCA TOCAMOS LOS ANTIGUOS)
      // =========================

      const created = await this.prisma.shift.create({
        data: {
          scheduleId,
          weekday,
          startTime,
          endTime,
          validFrom: fromDate,
          validTo: toDate,
        },
      });

      console.log('🟢 TURNO CREADO:', created);

      return created;

    } catch (err) {
      console.error('❌ ERROR EN addShiftToSchedule:', err);
      throw err;
    }
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
  async confirmSchedule(
  scheduleId: string,
  body: {
    removedTurns: {
      weekday: number;
      startTime: string;
      endTime: string;
      validFrom?: string;
    }[];
    newTurns: {
      weekday: number;
      startTime: string;
      endTime: string;
      validFrom: string;
      validTo?: string;
    }[];
  },
) {
  const schedule = await this.prisma.schedule.findUnique({
    where: { id: scheduleId },
  });

  if (!schedule) {
    throw new NotFoundException('Horario no encontrado');
  }

  const { removedTurns, newTurns } = body;

  // =========================
  // 1️⃣ BORRAR TURNOS ANTIGUOS EDITADOS
  // =========================
  for (const rt of removedTurns) {
    await this.prisma.shift.deleteMany({
      where: {
        scheduleId,
        weekday: rt.weekday,
        startTime: rt.startTime,
        endTime: rt.endTime,
        ...(rt.validFrom && { validFrom: new Date(rt.validFrom) }),
      },
    });
  }

  // =========================
  // 2️⃣ CREAR TURNOS NUEVOS
  // =========================
  for (const nt of newTurns) {
    await this.prisma.shift.create({
      data: {
        scheduleId,
        weekday: nt.weekday,
        startTime: nt.startTime,
        endTime: nt.endTime,
        validFrom: new Date(nt.validFrom),
        validTo: nt.validTo ? new Date(nt.validTo) : null,
      },
    });
  }

  // =========================
  // 3️⃣ CERRAR OTROS SCHEDULES ACTIVOS
  // =========================
  await this.prisma.schedule.updateMany({
    where: {
      userId: schedule.userId,
      validTo: null,
      NOT: { id: schedule.id },
    },
    data: { validTo: new Date() },
  });

  // =========================
  // 4️⃣ CONFIRMAR ESTE SCHEDULE
  // =========================
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
    const schedule = await this.prisma.schedule.findFirst({
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
        exceptions: true,
      },
    });

    console.log('🟥 BACKEND SCHEDULE ACTIVO:', schedule?.id || null);
    console.log('🟥 BACKEND SHIFTS CRUDOS:', schedule?.shifts || []);

    // 🔑 CLAVE: devolver null explícito si no hay horario
    if (!schedule) {
      return null;
    }

    return schedule;
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
     ELIMINAR TURNOS (SEGÚN CONTEXTO) — VERSION CORREGIDA
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
    const { mode, dateFrom, startTime, endTime } = body;

    if (!dateFrom || !startTime || !endTime) {
      throw new BadRequestException(
        'dateFrom, startTime y endTime son obligatorios',
      );
    }

    // 🔑 FECHAS CLAVE
    const todayStr = new Date().toISOString().slice(0, 10);
    const baseDate = new Date(dateFrom);

    // calcular weekday (1 = lunes ... 7 = domingo)
    const jsDay = baseDate.getDay(); // 0 = domingo
    const weekday = jsDay === 0 ? 7 : jsDay;

    // ======================================================
    // 🟢 CASO 1 — SOLO ESTE BLOQUE (UNA RECURRENCIA EXACTA)
    // ======================================================
    if (mode === 'ONLY_THIS_BLOCK') {
      console.log('🟥 BACKEND ONLY_THIS_BLOCK → borrando solo este patrón', {
        weekday,
        startTime,
        endTime,
      });

      return this.prisma.shift.deleteMany({
        where: {
          scheduleId,
          weekday,
          startTime: startTime,   // 👈 EXACTO, NO gte
          endTime: endTime,       // 👈 EXACTO, NO lte
        },
      });
    }

    // ======================================================
    // 🟢 CASO 2 — FROM_THIS_DAY_ON
    // ======================================================
    if (mode === 'FROM_THIS_DAY_ON') {
      // 🔒 NUNCA BORRAR PASADO
      if (dateFrom < todayStr) {
        console.log('⛔ INTENTO DE BORRAR PASADO BLOQUEADO', {
          dateFrom,
          todayStr,
        });
        return { count: 0 };
      }

      console.log('🟥 BACKEND FROM_THIS_DAY_ON → borrando recurrencia futura', {
        weekday,
        startTime,
        endTime,
        desde: dateFrom,
      });

      // ⚠️ En tu modelo actual solo podemos borrar la recurrencia completa
      // de ese weekday + horario (porque no hay fecha en shift)

      return this.prisma.shift.deleteMany({
        where: {
          scheduleId,
          weekday,
          startTime: startTime,
          endTime: endTime,
        },
      });
    }

    // ======================================================
    // OTROS MODOS (de momento no soportados aquí)
    // ======================================================
    throw new BadRequestException('Modo de borrado no soportado');
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