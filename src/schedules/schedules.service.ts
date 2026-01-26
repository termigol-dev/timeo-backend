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
  async confirmSchedule(scheduleId: string) {
    const schedule = await this.prisma.schedule.findUnique({
      where: { id: scheduleId },
    });

    if (!schedule) {
      throw new NotFoundException('Horario no encontrado');
    }

    // 1️⃣ Cerrar otros schedules activos del mismo usuario
    await this.prisma.schedule.updateMany({
      where: {
        userId: schedule.userId,
        validTo: null,
        NOT: { id: schedule.id },
      },
      data: { validTo: new Date() },
    });

    // 2️⃣ Activar este schedule
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

  async getActiveSchedule(userId: string, weekStartStr?: string) {

    // 1️⃣ Calcular semana base (lunes)
    const weekStart = weekStartStr
      ? new Date(weekStartStr + 'T00:00:00')
      : (() => {
        const d = new Date();
        const day = d.getDay(); // 0 domingo, 1 lunes...
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(d.setDate(diff));
        monday.setHours(0, 0, 0, 0);
        return monday;
      })();

    console.log('🧠 BACKEND weekStart usado para cálculo:', weekStart.toISOString().slice(0, 10));

    // 2️⃣ Obtener horario activo para ESA semana
    const schedule = await this.prisma.schedule.findFirst({
      where: {
        userId,
        validFrom: { lte: weekStart },
        OR: [
          { validTo: null },
          { validTo: { gte: weekStart } },
        ],
      },
      include: {
        shifts: true,
        exceptions: true,
      },
    });

    if (!schedule) {
      return {
        scheduleId: null,
        weekStart: weekStart.toISOString().slice(0, 10),
        days: [],
      };
    }

    const days = [];

    // 🔁 Lunes → Domingo
    for (let i = 0; i < 7; i++) {

      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + i);
      date.setHours(0, 0, 0, 0);

      const dateStr = date.toISOString().slice(0, 10);

      // weekday: 1 = lunes ... 7 = domingo
      const jsDay = date.getDay(); // 0 domingo
      const weekday = jsDay === 0 ? 7 : jsDay;

      // 3️⃣ Filtrar shifts realmente vigentes ese día
      const activeShifts = schedule.shifts.filter(shift => {

        const from = new Date(shift.validFrom);
        const to = shift.validTo ? new Date(shift.validTo) : null;

        // Normalizamos SOLO from a inicio de día
        from.setHours(0, 0, 0, 0);

        // ❗ MUY IMPORTANTE:
        // NO tocar las horas de validTo
        // porque tú lo guardas a 23:59:59.999
        const inRange =
          from.getTime() <= date.getTime() &&
          (!to || to.getTime() >= date.getTime());

        const matchesWeekday = shift.weekday === weekday;

        return inRange && matchesWeekday;
      });

      console.log('📅 BACKEND DÍA', dateStr, {
        weekday,
        activeShifts: activeShifts.map(s => ({
          weekday: s.weekday,
          startTime: s.startTime,
          endTime: s.endTime,
          validFrom: s.validFrom,
          validTo: s.validTo,
        })),
      });

      // 4️⃣ Excepciones de ese día exacto
      const dayExceptions = schedule.exceptions.filter(ex => {
        const exDate = new Date(ex.date);
        exDate.setHours(0, 0, 0, 0);
        return exDate.getTime() === date.getTime();
      });

      // 5️⃣ Aplicar reglas
      let finalTurns = activeShifts.map(s => ({
        startTime: s.startTime,
        endTime: s.endTime,
        source: 'regular',
      }));

      let isDayOff = false;

      for (const ex of dayExceptions) {

        if (ex.type === 'DAY_OFF') {
          isDayOff = true;
          finalTurns = [];
          break;
        }

        if (ex.type === 'MODIFIED_SHIFT') {
          finalTurns = finalTurns.filter(t =>
            !(
              t.startTime === ex.startTime &&
              t.endTime === ex.endTime
            )
          );
        }

        if (ex.type === 'EXTRA_SHIFT') {
          finalTurns.push({
            startTime: ex.startTime,
            endTime: ex.endTime,
            source: 'extra',
          });
        }
      }

      days.push({
        date: dateStr,
        weekday,
        turns: finalTurns,
        isDayOff,
      });
    }

    // 6️⃣ Resultado final
    return {
      scheduleId: schedule.id,
      weekStart: weekStart.toISOString().slice(0, 10),
      days,
    };
  }


  async addExceptions(
    scheduleId: string,
    exceptions: {
      type: 'MODIFIED_SHIFT' | 'EXTRA_SHIFT' | 'DAY_OFF';
      date: string;
      startTime?: string;
      endTime?: string;
      mode?: 'ONLY_THIS_BLOCK' | 'FROM_THIS_DAY_ON';
    }[],
  ) {
    console.log('🟥 ADD EXCEPTIONS SERVICE INPUT:', {
      scheduleId,
      count: exceptions.length,
      exceptions,
    });

    for (const ex of exceptions) {
      const exDate = new Date(ex.date);
      exDate.setHours(0, 0, 0, 0);

      // =========================
      // 🟢 CASO 1: SOLO ESTE DÍA
      // =========================
      if (!ex.mode || ex.mode === 'ONLY_THIS_BLOCK') {
        console.log('🟡 ONLY_THIS_BLOCK → creando excepción', ex);

        await this.prisma.scheduleException.create({
          data: {
            scheduleId,
            type: ex.type,
            date: exDate,
            startTime: ex.startTime,
            endTime: ex.endTime,
          },
        });

        continue;
      }

      // =========================
      // 🔥 CASO 2: DESDE ESTE DÍA EN ADELANTE
      // =========================
      if (ex.mode === 'FROM_THIS_DAY_ON') {
        console.log('🔥 FROM_THIS_DAY_ON → cerrando shifts desde', ex.date);

        // weekday de la fecha del borrado
        const jsDay = exDate.getDay(); // 0 domingo
        const weekday = jsDay === 0 ? 7 : jsDay;

        // 1️⃣ Buscar TODOS los shifts vigentes ese día para ese weekday
        const candidateShifts = await this.prisma.shift.findMany({
          where: {
            scheduleId,
            weekday,
            validFrom: { lte: exDate },
            OR: [
              { validTo: null },
              { validTo: { gte: exDate } },
            ],
          },
        });

        console.log('🔍 SHIFTS VIGENTES ESE DÍA:', candidateShifts.map(s => ({
          id: s.id,
          weekday: s.weekday,
          startTime: s.startTime,
          endTime: s.endTime,
          validFrom: s.validFrom,
          validTo: s.validTo,
        })));

        // 2️⃣ Filtrar en memoria por bloque horario concreto
        const shiftsToClose = candidateShifts.filter(s =>
          s.startTime === ex.startTime &&
          s.endTime === ex.endTime
        );

        console.log('✂️ SHIFTS A CERRAR REALMENTE:', shiftsToClose.length);

        for (const shift of shiftsToClose) {
          // Cerrar el turno el día anterior
          const newValidTo = new Date(exDate);
          newValidTo.setDate(exDate.getDate() - 1);
          newValidTo.setHours(23, 59, 59, 999);

          console.log('✂️ CERRANDO SHIFT:', {
            shiftId: shift.id,
            oldValidTo: shift.validTo,
            newValidTo,
          });

          await this.prisma.shift.update({
            where: { id: shift.id },
            data: {
              validTo: newValidTo,
            },
          });
        }

        continue;
      }
    }

    return { ok: true };
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
      console.log('🟡 ONLY_THIS_BLOCK → creando excepción, NO borramos shift', {
        scheduleId,
        weekday,
        startTime,
        endTime,
        dateFrom,
      });

      const date = new Date(dateFrom);
      date.setHours(0, 0, 0, 0);

      // Creamos una excepción para ese día concreto
      return this.prisma.scheduleException.create({
        data: {
          scheduleId,
          date,
          startTime,
          endTime,
          type: 'MODIFIED_SHIFT', // 🔥 CLAVE: nunca DELETE_SHIFT
        },
      });
    }
    // ======================================================
    // 🟢 CASO 2 — FROM_THIS_DAY_ON (cerrar turno desde esta fecha)
    // ======================================================
    if (mode === 'FROM_THIS_DAY_ON') {
      // 🔒 NUNCA PERMITIR MODIFICAR PASADO
      if (dateFrom < todayStr) {
        console.log('⛔ INTENTO DE BORRAR PASADO BLOQUEADO', {
          dateFrom,
          todayStr,
        });
        return { count: 0 };
      }

      console.log('🟥 BACKEND FROM_THIS_DAY_ON → cerrando turno desde esta fecha', {
        weekday,
        startTime,
        endTime,
        desde: dateFrom,
      });

      const date = new Date(dateFrom);
      date.setHours(0, 0, 0, 0);

      // 1️⃣ Buscar el shift activo que aplica en esa fecha
      const shift = await this.prisma.shift.findFirst({
        where: {
          scheduleId,
          weekday,
          startTime,
          endTime,
          validFrom: { lte: date },
          OR: [
            { validTo: null },
            { validTo: { gte: date } },
          ],
        },
        orderBy: {
          validFrom: 'desc',
        },
      });

      if (!shift) {
        console.log('⚠️ No se encontró shift activo para cerrar', {
          scheduleId,
          weekday,
          startTime,
          endTime,
          dateFrom,
        });
        return { count: 0 };
      }

      // 2️⃣ Cerrar su vigencia el día anterior
      const dayBefore = new Date(date);
      dayBefore.setDate(dayBefore.getDate() - 1);

      return this.prisma.shift.update({
        where: { id: shift.id },
        data: {
          validTo: dayBefore,
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