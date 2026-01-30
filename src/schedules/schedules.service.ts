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

  private formatDateLocal(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

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

    // ⚠️ validFrom se ajustará al confirmar el horario
    return this.prisma.schedule.create({
      data: {
        userId,
        branchId,
        validFrom: new Date(),
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
      validFrom: string;   // YYYY-MM-DD
      validTo?: string;    // YYYY-MM-DD | null
    },
  ) {
    try {
      console.log('🟡 ADD SHIFT SERVICE INPUT:', {
        scheduleId,
        data,
      });

      let { weekday, startTime, endTime, validFrom, validTo } = data;

      // ==================================================
      // 🛡️ BLINDAJE TOTAL DE weekday
      // ==================================================
      // 0, null, undefined, NaN → inválido controlado
      if (
        weekday === null ||
        weekday === undefined ||
        Number.isNaN(weekday)
      ) {
        throw new BadRequestException('Día inválido (weekday nulo)');
      }

      // Solo aceptamos 1..7
      if (weekday < 1 || weekday > 7) {
        throw new BadRequestException(
          `Día inválido: ${weekday}. Debe ser 1 (lunes) a 7 (domingo)`
        );
      }

      // ==================================================
      // VALIDACIONES BÁSICAS
      // ==================================================
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

      // ==================================================
      // FECHAS NORMALIZADAS A LOCAL (00:00)
      // ==================================================
      const fromDate = new Date(validFrom);
      fromDate.setHours(0, 0, 0, 0);

      const toDate = validTo ? new Date(validTo) : null;
      if (toDate) {
        toDate.setHours(0, 0, 0, 0);
      }

      if (toDate && fromDate > toDate) {
        throw new BadRequestException(
          'La fecha de inicio no puede ser posterior a la de fin',
        );
      }

      // ==================================================
      // 🔒 REGLA DE ORO: NO TOCAR EL PASADO
      // ==================================================
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (fromDate < today) {
        throw new BadRequestException(
          'No se pueden crear o modificar turnos en el pasado',
        );
      }

      // ==================================================
      // BUSCAR TURNOS QUE SOLAPEN (MISMO weekday 1..7)
      // ==================================================
      const existingShifts = await this.prisma.shift.findMany({
        where: {
          scheduleId,
          weekday,

          AND: [
            {
              OR: [
                { validTo: null },
                { validTo: { gte: fromDate } },
              ],
            },
            {
              OR: [
                { validFrom: { lte: toDate ?? undefined } },
              ],
            },
          ],
        },
      });

      // ==================================================
      // COMPROBAR SOLAPE HORARIO
      // ==================================================
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

      // ==================================================
      // CREAR TURNO NUEVO (INMUTABILIDAD DEL PASADO)
      // ==================================================
      const created = await this.prisma.shift.create({
        data: {
          scheduleId,
          weekday,          // 👈 SIEMPRE 1..7
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

    // ==================================================
    // 1️⃣ CALCULAR WEEKSTART — SIEMPRE LUNES (1)
    // ==================================================
    let weekStart: Date;

    if (weekStartStr) {
      const d = new Date(weekStartStr);
      d.setHours(0, 0, 0, 0);

      const jsDay = d.getDay(); // 0 domingo, 1 lunes...

      // 🔑 CONVERSIÓN FORZADA A LUNES
      const offset =
        jsDay === 0 ? -6 : 1 - jsDay;

      d.setDate(d.getDate() + offset);
      weekStart = d;
    } else {
      const d = new Date();
      d.setHours(0, 0, 0, 0);

      const jsDay = d.getDay();
      const offset =
        jsDay === 0 ? -6 : 1 - jsDay;

      d.setDate(d.getDate() + offset);
      weekStart = d;
    }

    console.log(
      '🧠 BACKEND weekStart NORMALIZADO (lunes):',
      this.formatDateLocal(weekStart)
    );

    // ==================================================
    // 2️⃣ OBTENER SCHEDULE ACTIVO
    // ==================================================
    const schedule = await this.prisma.schedule.findFirst({
      where: {
        userId,
        validFrom: { lte: weekStart },
        OR: [
          { validTo: null },
          { validTo: { gte: weekStart } },
        ],
        shifts: {
          some: {},
        },
      },
      orderBy: {
        validFrom: 'desc',
      },
      include: {
        shifts: true,
        exceptions: true,
      },
    });

    if (!schedule) {
      return {
        scheduleId: null,
        weekStart: this.formatDateLocal(weekStart),
        days: [],
      };
    }

    const days = [];

    // ==================================================
    // 3️⃣ LUNES (1) → DOMINGO (7)
    // ==================================================
    for (let i = 0; i < 7; i++) {

      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + i);
      date.setHours(0, 0, 0, 0);

      const dateStr = this.formatDateLocal(date);

      const jsDay = date.getDay(); // 0..6
      const weekday =
        jsDay === 0 ? 7 : jsDay; // 👈 BLINDAJE FINAL

      // ==================================================
      // 4️⃣ TURNOS VIGENTES ESE DÍA
      // ==================================================
      const activeShifts = schedule.shifts.filter(shift => {

        if (shift.weekday < 1 || shift.weekday > 7) {
          return false; // 🛡️ BLINDAJE
        }

        const from = new Date(shift.validFrom);
        from.setHours(0, 0, 0, 0);

        const to = shift.validTo
          ? new Date(shift.validTo)
          : null;
        if (to) to.setHours(0, 0, 0, 0);

        const inRange =
          from.getTime() <= date.getTime() &&
          (!to || to.getTime() >= date.getTime());

        return inRange && shift.weekday === weekday;
      });

      // ==================================================
      // 5️⃣ EXCEPCIONES DEL DÍA (LOCAL)
      // ==================================================
      const dayExceptions = schedule.exceptions.filter(ex => {
        const exDateStr =
          this.formatDateLocal(new Date(ex.date));
        return exDateStr === dateStr;
      });

      // ==================================================
      // 6️⃣ APLICAR REGLAS
      // ==================================================
      let finalTurns = activeShifts.map(s => ({
        startTime: s.startTime,
        endTime: s.endTime,
        source: 'regular',
      }));

      let isDayOff = false;
      let isVacation = false;

      for (const ex of dayExceptions) {

        if (ex.type === 'VACATION') {
          isVacation = true;
          finalTurns = [];
          break;
        }

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
        weekday, // ✅ SIEMPRE 1..7
        turns: finalTurns,
        isDayOff,
        isVacation,
      });
    }

    // ==================================================
    // 7️⃣ RESULTADO FINAL
    // ==================================================
    return {
      scheduleId: schedule.id,
      weekStart: this.formatDateLocal(weekStart),
      days,
    };
  }

  async addExceptions(
    scheduleId: string,
    exceptions: {
      type: 'MODIFIED_SHIFT' | 'EXTRA_SHIFT' | 'DAY_OFF' | 'VACATION';
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
        await this.prisma.scheduleException.create({
          data: {
            scheduleId,
            type: ex.type,
            date: exDate,
            startTime: ex.startTime ?? null,
            endTime: ex.endTime ?? null,
          },
        });
        continue;
      }

      // =========================
      // 🔥 CASO 2: DESDE ESTE DÍA EN ADELANTE
      // =========================
      if (ex.mode === 'FROM_THIS_DAY_ON') {

        // VACATION / DAY_OFF → solo excepción
        if (ex.type === 'VACATION' || ex.type === 'DAY_OFF') {
          await this.prisma.scheduleException.create({
            data: {
              scheduleId,
              type: ex.type,
              date: exDate,
            },
          });
          continue;
        }

        // 🔴 MODIFIED_SHIFT → cerrar shifts
        const jsDay = exDate.getDay(); // 0..6
        const weekday = jsDay === 0 ? 7 : jsDay;

        if (weekday < 1 || weekday > 7) continue;

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

        const shiftsToClose = candidateShifts.filter(s =>
          s.startTime === ex.startTime &&
          s.endTime === ex.endTime,
        );

        for (const shift of shiftsToClose) {
          const newValidTo = new Date(exDate);
          newValidTo.setDate(exDate.getDate() - 1);
          newValidTo.setHours(23, 59, 59, 999);

          await this.prisma.shift.update({
            where: { id: shift.id },
            data: { validTo: newValidTo },
          });
        }
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

    const jsDay = date.getDay(); // 0..6
    const weekday = jsDay === 0 ? 7 : jsDay;

    if (weekday < 1 || weekday > 7) return null;

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

    const baseDate = new Date(dateFrom);
    baseDate.setHours(0, 0, 0, 0);

    const jsDay = baseDate.getDay();
    const weekday = jsDay === 0 ? 7 : jsDay;

    if (weekday < 1 || weekday > 7) {
      return { count: 0 };
    }

    // ======================================================
    // SOLO ESTE BLOQUE
    // ======================================================
    if (mode === 'ONLY_THIS_BLOCK') {
      return this.prisma.scheduleException.create({
        data: {
          scheduleId,
          date: baseDate,
          startTime,
          endTime,
          type: 'MODIFIED_SHIFT',
        },
      });
    }

    // ======================================================
    // FROM_THIS_DAY_ON
    // ======================================================
    if (mode === 'FROM_THIS_DAY_ON') {
      const shift = await this.prisma.shift.findFirst({
        where: {
          scheduleId,
          weekday,
          startTime,
          endTime,
          validFrom: { lte: baseDate },
          OR: [{ validTo: null }, { validTo: { gte: baseDate } }],
        },
        orderBy: { validFrom: 'desc' },
      });

      if (!shift) return { count: 0 };

      const dayBefore = new Date(baseDate);
      dayBefore.setDate(dayBefore.getDate() - 1);
      dayBefore.setHours(23, 59, 59, 999);

      return this.prisma.shift.update({
        where: { id: shift.id },
        data: { validTo: dayBefore },
      });
    }

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


    const toDate = new Date(fromDate);
    toDate.setFullYear(toDate.getFullYear() + 2);

    return this.prisma.scheduleException.deleteMany({
      where: {
        scheduleId,
        type: 'VACATION',
        date: { gte: fromDate, lte: toDate },
      },
    });
  }

}

