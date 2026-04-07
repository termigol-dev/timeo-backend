import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';
import { ScheduleExceptionType } from '@prisma/client';

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
      weekday?: number;          // 🔥 ahora opcional
      weekdays?: number[];       // 🔥 nuevo
      startTime: string;
      endTime: string;
      validFrom: string;
      validTo?: string;
    },
  ) {
    try {
      console.log('🟡 ADD SHIFT SERVICE INPUT:', { scheduleId, data });

      const { weekday, weekdays, startTime, endTime, validFrom, validTo } = data;

      // ================================
      // 🧠 NORMALIZAR WEEKDAYS
      // ================================
      let finalWeekdays: number[] = [];

      if (Array.isArray(weekdays) && weekdays.length > 0) {
        finalWeekdays = weekdays;
      } else if (weekday != null) {
        finalWeekdays = [weekday];
      } else {
        throw new BadRequestException('Debe venir weekday o weekdays');
      }

      console.log('🧪 WEEKDAYS NORMALIZADOS:', finalWeekdays);

      // ================================
      // VALIDACIONES BÁSICAS
      // ================================
      for (const wd of finalWeekdays) {
        if (wd < 1 || wd > 7) {
          throw new BadRequestException('weekday fuera de rango');
        }
      }

      if (!startTime || !endTime || startTime >= endTime) {
        throw new BadRequestException('Horas inválidas');
      }

      if (!validFrom) {
        throw new BadRequestException('validFrom obligatorio');
      }

      const parseLocal = (s: string) => {
        const [y, m, d] = s.split('-').map(Number);
        const dt = new Date(y, m - 1, d);
        dt.setHours(0, 0, 0, 0);
        return dt;
      };

      const fromDate = parseLocal(validFrom);
      const toDate = validTo ? parseLocal(validTo) : null;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (fromDate < today) {
        throw new BadRequestException('No tocar pasado');
      }

      // ================================
      // 🔥 CREAR UN SHIFT POR CADA DÍA
      // ================================
      const createdShifts = [];

      for (const wd of finalWeekdays) {
        const created = await this.prisma.shift.create({
          data: {
            scheduleId,
            weekday: wd,              // 🔁 mantenemos compatibilidad
            weekdays: finalWeekdays,  // 🔥 nuevo campo clave
            startTime,
            endTime,
            validFrom: fromDate,
            validTo: toDate,
          },
        });

        createdShifts.push(created);
      }

      console.log('🟢 SHIFTS CREADOS:', createdShifts);

      return createdShifts;

    } catch (err) {
      console.error('❌ ERROR EN addShiftToSchedule:', err);
      throw err;
    }
  }

  /*=======================================================
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
    date.setHours(0, 0, 0, 0);

    // 🔁 Eliminar excepción previa si existe
    await this.prisma.scheduleException.deleteMany({
      where: {
        scheduleId,
        date,
      },
    });

    // Crear VACATION (día completo vacío)
    return this.prisma.scheduleException.create({
      data: {
        scheduleId,
        date,
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

    return this.prisma.$transaction(async tx => {

      const schedule = await tx.schedule.findUnique({
        where: { id: scheduleId },
        include: {
          shifts: true,
        },
      });

      if (!schedule) {
        throw new NotFoundException('Horario no encontrado');
      }

      if (!schedule.shifts || schedule.shifts.length === 0) {
        throw new BadRequestException(
          'No se puede confirmar un horario sin turnos',
        );
      }

      // ==================================================
      // 🔑 El validFrom REAL del schedule es el primer
      //     validFrom de sus turnos
      // ==================================================
      const minShiftDate = schedule.shifts.reduce((min, s) => {
        return s.validFrom < min ? s.validFrom : min;
      }, schedule.shifts[0].validFrom);

      const scheduleValidFrom = new Date(minShiftDate);
      scheduleValidFrom.setHours(0, 0, 0, 0);

      // ==================================================
      // 1️⃣ Cerrar otros schedules activos del mismo usuario
      //     justo el día anterior
      // ==================================================
      const previousScheduleValidTo = new Date(scheduleValidFrom);
      previousScheduleValidTo.setDate(previousScheduleValidTo.getDate() - 1);
      previousScheduleValidTo.setHours(23, 59, 59, 999);

      await tx.schedule.updateMany({
        where: {
          userId: schedule.userId,
          validTo: null,
          NOT: { id: schedule.id },
        },
        data: {
          validTo: previousScheduleValidTo,
        },
      });

      // ==================================================
      // 2️⃣ Activar este schedule
      // ==================================================
      return tx.schedule.update({
        where: { id: schedule.id },
        data: {
          validFrom: scheduleValidFrom,
          validTo: null,
        },
      });

    });
  }


  /* ======================================================
   OBTENER HORARIO ACTIVO
====================================================== */
  async getActiveSchedule(userId: string, weekStartStr?: string) {
    try {
      console.log('🧪 SERVICE getActiveSchedule START', { userId, weekStartStr });

      const mergeTurns = (turns: any[] = []) => {
        if (!Array.isArray(turns) || turns.length === 0) return [];

        const sorted = [...turns].sort((a, b) =>
          (a.startTime || '').localeCompare(b.startTime || '')
        );

        const merged = [{ ...sorted[0] }];

        for (let i = 1; i < sorted.length; i++) {
          const last = merged[merged.length - 1];
          const cur = sorted[i];

          if (cur.startTime <= last.endTime) {
            if (cur.endTime > last.endTime) {
              last.endTime = cur.endTime;
            }
          } else {
            merged.push({ ...cur });
          }
        }

        return merged;
      };

      let weekStart: Date;

      const base = weekStartStr ? new Date(weekStartStr) : new Date();
      base.setHours(0, 0, 0, 0);

      const jsDay = base.getDay();
      const offset = jsDay === 0 ? -6 : 1 - jsDay;

      base.setDate(base.getDate() + offset);
      weekStart = base;

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      const schedule = await this.prisma.schedule.findFirst({
        where: {
          userId,
          validFrom: { lte: weekEnd },
          OR: [
            { validTo: null },
            { validTo: { gte: weekStart } },
          ],
        },
        orderBy: { validFrom: 'desc' },
        include: {
          shifts: true,
          exceptions: { include: { blocks: true } },
        },
      });
      console.log('🔥 EXCEPTIONS RAW:', schedule?.exceptions);
      console.log('🧪 schedule loaded:', {
        id: schedule?.id,
        shifts: schedule?.shifts?.length,
        exceptions: schedule?.exceptions?.length,
      });

      if (!schedule) {
        return {
          scheduleId: null,
          weekStart: this.formatDateLocal(weekStart),
          days: [],
        };
      }

      const days = [];

      for (let i = 0; i < 7; i++) {

        const date = new Date(weekStart);
        date.setDate(weekStart.getDate() + i);
        date.setHours(0, 0, 0, 0);

        const dateStr = this.formatDateLocal(date);

        const jsDay = date.getDay();
        const weekday = jsDay === 0 ? 7 : jsDay;

        // ======================================================
        // 🔥 1. BUSCAR EXCEPCIÓN
        // ======================================================
        const exception = (schedule.exceptions || []).find(ex => {
          if (!ex?.date) return false;

          const exDateStr = ex.date.toISOString().slice(0, 10);

          return exDateStr === dateStr;
        });

        let finalTurns: {
          id?: string;
          startTime: string;
          endTime: string;
          source: string;
        }[] = [];

        let isVacation = false;

        // ======================================================
        // 🔴 2. EXCEPCIÓN
        // ======================================================
        if (exception) {

          const blocks = Array.isArray(exception.blocks)
            ? exception.blocks
            : null;

          // 🟠 DAY_OFF → no trabaja
          if (exception.type === 'DAY_OFF') {
            finalTurns = [];
            isVacation = true;
          }

          // 🟡 MODIFIED_SHIFT
          else if (blocks !== null) {
            finalTurns = blocks.map(b => ({
              startTime: b.startTime,
              endTime: b.endTime,
              source: 'modified',
            }));
          }

        } else {

          // ======================================================
          // 🟢 TURNOS BASE
          // ======================================================
          const activeShifts = (schedule.shifts || []).filter(shift => {

            if (!shift.validFrom) return false;

            const from = new Date(shift.validFrom);
            from.setHours(0, 0, 0, 0);

            const to = shift.validTo ? new Date(shift.validTo) : null;
            if (to) to.setHours(0, 0, 0, 0);

            const inRange =
              from.getTime() <= date.getTime() &&
              (!to || to.getTime() >= date.getTime());

            return inRange && shift.weekday === weekday;
          });

          finalTurns = activeShifts.map(s => ({
            id: s.id,
            startTime: s.startTime,
            endTime: s.endTime,
            source: 'regular',
          }));
        }

        finalTurns = mergeTurns(finalTurns);

        days.push({
          date: dateStr,
          weekday,
          turns: finalTurns,
          isVacation,
        });
      }

      return {
        scheduleId: schedule.id,
        weekStart: this.formatDateLocal(weekStart),
        days,
      };

    } catch (e) {
      console.error('🔥 getActiveSchedule CRASH:', e);
      throw e;
    }
  }

  async addExceptions(
    scheduleId: string,
    exceptions: {
      type: 'EXTRA_SHIFT' | 'MODIFIED_SHIFT' | 'DAY_OFF' | 'VACATION';
      date: string;
      blocks?: { startTime: string; endTime: string }[];
      mode?: 'ONLY_THIS_BLOCK' | 'FROM_THIS_DAY_ON';
    }[],
  ) {

    for (const ex of exceptions) {

      console.log('🧪 EXCEPTION INPUT', ex);

      const exDate = new Date(ex.date);
      exDate.setHours(0, 0, 0, 0);

      // =====================================================
      // 🔴 1. BORRAR SIEMPRE LO QUE HAYA ESE DÍA
      // =====================================================
      const existing = await this.prisma.scheduleException.findMany({
        where: { scheduleId, date: exDate },
        select: { id: true },
      });

      if (existing.length > 0) {
        await this.prisma.scheduleExceptionBlock.deleteMany({
          where: {
            exceptionId: { in: existing.map(e => e.id) },
          },
        });

        await this.prisma.scheduleException.deleteMany({
          where: { id: { in: existing.map(e => e.id) } },
        });

        console.log('🧹 OLD EXCEPTIONS REMOVED');
      }

      // =====================================================
      // 🔵 2. MAPEAR TIPO (ENUM CORRECTO)
      // =====================================================
      let mappedType: ScheduleExceptionType;

      if (ex.type === 'VACATION') {
        mappedType = ScheduleExceptionType.VACATION;
      } else if (ex.type === 'DAY_OFF') {
        mappedType = ScheduleExceptionType.DAY_OFF;
      } else if (ex.type === 'MODIFIED_SHIFT') {
        mappedType = ScheduleExceptionType.MODIFIED_SHIFT;
      } else {
        mappedType = ScheduleExceptionType.EXTRA_SHIFT;
      }

      // =====================================================
      // 🟢 3. CREAR EXCEPCIÓN
      // =====================================================
      const exception = await this.prisma.scheduleException.create({
        data: {
          scheduleId,
          date: exDate,
          type: mappedType,
        },
      });

      console.log('✅ EXCEPTION CREATED', exception.id);

      // =====================================================
      // 🧱 4. CREAR BLOQUES (si existen)
      // =====================================================
      if (ex.blocks && ex.blocks.length > 0) {
        await this.prisma.scheduleExceptionBlock.createMany({
          data: ex.blocks.map(b => ({
            exceptionId: exception.id,
            startTime: b.startTime,
            endTime: b.endTime,
          })),
        });

        console.log('🧱 BLOCKS CREATED', ex.blocks);
      } else {
        console.log('⚠️ NO BLOCKS (día vacío o vacation)');
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
  async deleteShift(op: {
    scheduleId: string;
    shiftId?: string;
    weekdays?: number[];
    startTime?: string;
    endTime?: string;
    fromDate?: string;
    date?: string;
  }) {

    console.log('🔴 SERVICE DELETE INPUT:', op);

    if (op.shiftId) {
      return this.prisma.shift.delete({
        where: { id: op.shiftId },
      });
    }

    const {
      scheduleId,
      weekdays,
      startTime,
      endTime, // 👈 IMPORTANTE
    } = op;

    const fromDate = op.fromDate ?? op.date;

    if (!weekdays || !fromDate) {
      throw new BadRequestException('Faltan datos para borrar por patrón');
    }

    const from = new Date(fromDate);

    console.log('🔴 SERVICE DESTRUCTURED:', {
      weekdays,
      startTime,
      endTime,
      fromDate,
    });

    let totalAffected = 0;

    for (const weekday of weekdays) {

      const shifts = await this.prisma.shift.findMany({
        where: {
          scheduleId,
          weekday,
          OR: [
            { validTo: null },
            { validTo: { gte: from } },
          ],
        },
      });

      console.log('🔥 SHIFTS ENCONTRADOS:', shifts.length);

      // 🔥 FILTRO CLAVE (AÑADIDO)
      const filteredShifts = shifts.filter(shift =>
        (!startTime || shift.startTime.startsWith(startTime)) &&
        (!endTime || shift.endTime.startsWith(endTime))
      );

      console.log('🟢 SHIFTS FILTRADOS:', filteredShifts.length);

      for (const shift of filteredShifts) {
        const shiftStart = new Date(shift.validFrom);

        if (shiftStart < from) {
          const dayBefore = new Date(from);
          dayBefore.setDate(dayBefore.getDate() - 1);

          await this.prisma.shift.update({
            where: { id: shift.id },
            data: { validTo: dayBefore },
          });
        } else {
          await this.prisma.shift.delete({
            where: { id: shift.id },
          });
        }

        totalAffected++;
      }
    }

    console.log('✅ DELETE RESULT:', totalAffected);

    return { affected: totalAffected };
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

