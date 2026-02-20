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
    weekday: number;
    startTime: string;
    endTime: string;
    validFrom: string;
    validTo?: string;
  },
) {
  try {
    console.log('🟡 ADD SHIFT SERVICE INPUT:', {
      scheduleId,
      data,
    });

    const { weekday, startTime, endTime, validFrom, validTo } = data;

    if (
      weekday === null ||
      weekday === undefined ||
      Number.isNaN(weekday)
    ) {
      throw new BadRequestException('Día inválido (weekday nulo)');
    }

    if (weekday < 1 || weekday > 7) {
      throw new BadRequestException(
        `Día inválido: ${weekday}. Debe ser 1 (lunes) a 7 (domingo)`,
      );
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

    const parseLocalDate = (str: string): Date => {
      const [y, m, d] = str.split('-').map(Number);
      if (!y || !m || !d) {
        throw new BadRequestException(`Fecha inválida: ${str}`);
      }
      const date = new Date(y, m - 1, d);
      date.setHours(0, 0, 0, 0);
      return date;
    };

    const fromDate = parseLocalDate(validFrom);
    const toDate = validTo ? parseLocalDate(validTo) : null;

    if (toDate && fromDate.getTime() > toDate.getTime()) {
      throw new BadRequestException(
        'La fecha de inicio no puede ser posterior a la de fin',
      );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (fromDate.getTime() < today.getTime()) {
      throw new BadRequestException(
        'No se pueden crear o modificar turnos en el pasado',
      );
    }

    // ==================================================
    // 🧠 TIMEO — OVERRIDE DAY RULE
    // ==================================================
    const hasOverride = await this.prisma.scheduleException.findFirst({
      where: {
        scheduleId,
        date: fromDate,
        type: 'MODIFIED_SHIFT',
      },
      select: { id: true },
    });

    if (!hasOverride) {
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
              validFrom: {
                lte: toDate ?? new Date('9999-12-31'),
              },
            },
          ],
        },
      });

      const hasOverlap = existingShifts.some(shift =>
        startTime < shift.endTime &&
        endTime > shift.startTime,
      );

      if (hasOverlap) {
        throw new BadRequestException(
          'El turno se solapa con uno existente en esas fechas',
        );
      }
    } else {
      console.log('🧠 OVERRIDE DAY → skip overlap validation');
    }

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
      /* ==================================================
         🔑 helper local — fusionar bloques contiguos
      ================================================== */
      const mergeTurns = (turns: {
        startTime: string;
        endTime: string;
        source: string;
      }[] = []) => {

        if (!Array.isArray(turns) || turns.length === 0) return [];

        const sorted = [...turns].sort(
          (a, b) => (a.startTime || '').localeCompare(b.startTime || '')
        );

        const merged = [{ ...sorted[0] }];

        for (let i = 1; i < sorted.length; i++) {

          const last = merged[merged.length - 1];
          const cur = sorted[i];

          if (!last || !cur) continue;

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

      /* ==================================================
         1️⃣ CALCULAR WEEKSTART
      ================================================== */
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

      /* ==================================================
         2️⃣ OBTENER SCHEDULE
      ================================================== */
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

      /* ==================================================
         3️⃣ RECORRER SEMANA
      ================================================== */
      for (let i = 0; i < 7; i++) {

        const date = new Date(weekStart);
        date.setDate(weekStart.getDate() + i);
        date.setHours(0, 0, 0, 0);

        const dateStr = this.formatDateLocal(date);
        console.log('🧪 building day:', dateStr);

        const jsDay = date.getDay();
        const weekday = jsDay === 0 ? 7 : jsDay;

        /* ----------------------------------------------
           SHIFTS BASE
        ---------------------------------------------- */
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

        let finalTurns = activeShifts.map(s => ({
          startTime: s.startTime,
          endTime: s.endTime,
          source: 'regular',
        }));

        /* ----------------------------------------------
           EXCEPCIÓN DEL DÍA (BLINDADA)
        ---------------------------------------------- */
        const exception = (schedule.exceptions || []).find(ex => {

          if (!ex?.date) return false;

          const d = new Date(ex.date);
          if (isNaN(d.getTime())) return false;

          const exDateStr = this.formatDateLocal(d);
          return exDateStr === dateStr;
        });

        let isVacation = false;

        if (exception) {

          const blocks = Array.isArray(exception.blocks)
            ? exception.blocks
            : null;

          // 👉 CLAVE: si blocks existe aunque esté vacío,
          // significa que el día fue redefinido

          if (blocks !== null) {

            finalTurns = blocks.map(b => ({
              startTime: b.startTime,
              endTime: b.endTime,
              source: 'modified',
            }));

          } else if (exception.type === 'VACATION' || exception.type === 'DAY_OFF') {

            finalTurns = [];
            isVacation = exception.type === 'VACATION';

          }
        }

        /* ---------------------------------------------- */
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
      startTime?: string;
      endTime?: string;
      blocks?: { startTime: string; endTime: string }[];
      mode?: 'ONLY_THIS_BLOCK' | 'FROM_THIS_DAY_ON';
    }[],
  ) {

    for (const ex of exceptions) {

      console.log('🧪 EXCEPTION INPUT', ex);

      const exDate = new Date(ex.date);
      exDate.setHours(0, 0, 0, 0);

      const jsDay = exDate.getDay();
      const weekday = jsDay === 0 ? 7 : jsDay;

      console.log('🧪 EX DATE + WEEKDAY', { exDate, weekday });

      /* =====================================================
         🟠 ONLY_THIS_BLOCK
      ===================================================== */

      if (!ex.mode || ex.mode === 'ONLY_THIS_BLOCK') {

        // ⭐ helper → reescritura segura
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
        }

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

        if (ex.type === 'EXTRA_SHIFT') continue;

        /* ---------------------------
           ✅ MODIFIED_SHIFT
        --------------------------- */
        if (ex.type === 'MODIFIED_SHIFT') {

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

          console.log('🧪 CANDIDATE SHIFTS', candidateShifts);

          const remainingBlocks = ex.blocks ?? [];

          console.log('🧪 REMAINING BLOCKS (FROM FRONT)', remainingBlocks);

          const exception = await this.prisma.scheduleException.create({
            data: {
              scheduleId,
              type: 'MODIFIED_SHIFT',
              date: exDate,
            },
          });

          if (remainingBlocks.length > 0) {
            await this.prisma.scheduleExceptionBlock.createMany({
              data: remainingBlocks.map(b => ({
                exceptionId: exception.id,
                startTime: b.startTime,
                endTime: b.endTime,
              })),
            });
          }

          continue;
        }
      }

      /* =====================================================
         🔵 FROM_THIS_DAY_ON
      ===================================================== */

      if (ex.mode === 'FROM_THIS_DAY_ON') {

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

        if (ex.type === 'EXTRA_SHIFT') continue;

        if (ex.type === 'MODIFIED_SHIFT') {

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

          console.log('🧪 STRUCTURAL CANDIDATES', candidateShifts);

          if (candidateShifts.length === 0) continue;

          for (const shift of candidateShifts) {

            if (shift.validFrom > exDate) {

              await this.prisma.shift.delete({
                where: { id: shift.id },
              });

            } else {

              const previousDay = new Date(exDate);
              previousDay.setDate(previousDay.getDate() - 1);
              previousDay.setHours(23, 59, 59, 999);

              await this.prisma.shift.update({
                where: { id: shift.id },
                data: { validTo: previousDay },
              });
            }
          }
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
  /* ======================================================
      ELIMINAR TURNOS (SEGÚN CONTEXTO) — VERSION CORREGIDA
   ====================================================== */
  async deleteShift(
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
    // SOLO ESTE BLOQUE  → excepción
    // ======================================================
    if (mode === 'ONLY_THIS_BLOCK') {

      // 1️⃣ Eliminar excepción previa del día
      await this.prisma.scheduleException.deleteMany({
        where: {
          scheduleId,
          date: baseDate,
        },
      });

      // 2️⃣ Crear excepción MODIFIED_SHIFT
      const exception = await this.prisma.scheduleException.create({
        data: {
          scheduleId,
          date: baseDate,
          type: 'MODIFIED_SHIFT',
        },
      });

      // 3️⃣ Crear bloque que REPRESENTA LO QUE QUEDA
      // OJO: deleteShift recibe el bloque que se quiere eliminar,
      // pero el modelo nuevo guarda los bloques que SÍ se trabajan.
      // Como aquí estamos usando la versión antigua,
      // lo mantenemos como bloque único (recortado luego en getActiveSchedule)

      await this.prisma.scheduleExceptionBlock.create({
        data: {
          exceptionId: exception.id,
          startTime,
          endTime,
        },
      });

      return { created: true };
    }

    // ======================================================
    // FROM_THIS_DAY_ON  → estructural por rango
    // ======================================================
    if (mode === 'FROM_THIS_DAY_ON') {

      const shifts = await this.prisma.shift.findMany({
        where: {
          scheduleId,
          weekday,

          // turno activo ese día
          validFrom: { lte: baseDate },
          OR: [
            { validTo: null },
            { validTo: { gte: baseDate } },
          ],

          // solape real con el rango horario
          NOT: [
            {
              OR: [
                { endTime: { lte: startTime } },
                { startTime: { gte: endTime } },
              ],
            },
          ],
        },
      });

      if (!shifts.length) {
        return { count: 0 };
      }

      const dayBefore = new Date(baseDate);
      dayBefore.setDate(dayBefore.getDate() - 1);
      dayBefore.setHours(23, 59, 59, 999);

      let created = 0;

      for (const shift of shifts) {

        // 🔑 guardamos el validTo original
        const originalValidTo = shift.validTo;

        // cerramos el turno original
        await this.prisma.shift.update({
          where: { id: shift.id },
          data: { validTo: dayBefore },
        });

        // parte izquierda
        if (shift.startTime < startTime) {
          await this.prisma.shift.create({
            data: {
              scheduleId,
              weekday: shift.weekday,
              startTime: shift.startTime,
              endTime: startTime,
              validFrom: baseDate,
              validTo: originalValidTo,
            },
          });

          created++;
        }

        // parte derecha
        if (shift.endTime > endTime) {
          await this.prisma.shift.create({
            data: {
              scheduleId,
              weekday: shift.weekday,
              startTime: endTime,
              endTime: shift.endTime,
              validFrom: baseDate,
              validTo: originalValidTo,
            },
          });

          created++;
        }
      }

      return {
        count: shifts.length,
        created,
      };
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

