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
 * - Se crean en borrador
 * - Se validan
 * - Se confirman de una sola vez
 */
@Injectable()
export class SchedulesService {
  constructor(private prisma: PrismaService) {}

  /* ======================================================
     CREAR HORARIO EN BORRADOR (NO ACTIVO AÚN)
  ====================================================== */
  async createDraftSchedule(
    companyId: string,
    branchId: string,
    userId: string,
    admin: any,
  ) {
    // Permisos
    if (
      ![Role.SUPERADMIN, Role.ADMIN_EMPRESA, Role.ADMIN_SUCURSAL].includes(
        admin.role,
      )
    ) {
      throw new ForbiddenException();
    }

    // Comprobamos que el empleado pertenece a la empresa
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
        validFrom: new Date(), // se ajustará al confirmar
      },
      include: { shifts: true },
    });
  }

  /* ======================================================
     AÑADIR TURNO A HORARIO (BORRADOR)
     weekday: 1 (lunes) → 7 (domingo)
     startTime / endTime: "HH:mm"
  ====================================================== */
  async addShiftToSchedule(
    scheduleId: string,
    data: {
      weekday: number;
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
     ELIMINAR TURNO (BORRADOR)
  ====================================================== */
  async removeShift(shiftId: string) {
    return this.prisma.shift.delete({
      where: { id: shiftId },
    });
  }

  /* ======================================================
     PREVISUALIZAR HORAS SEMANALES (SIN GUARDAR)
  ====================================================== */
  async calculateWeeklyHours(scheduleId: string) {
    const shifts = await this.prisma.shift.findMany({
      where: { scheduleId },
    });

    let totalMinutes = 0;

    for (const shift of shifts) {
      const [sh, sm] = shift.startTime.split(':').map(Number);
      const [eh, em] = shift.endTime.split(':').map(Number);

      const start = sh * 60 + sm;
      const end = eh * 60 + em;

      totalMinutes += end - start;
    }

    return {
      hours: Math.floor(totalMinutes / 60),
      minutes: totalMinutes % 60,
      totalMinutes,
    };
  }

  /* ======================================================
     CONFIRMAR HORARIO (ACTIVARLO)
     - Cierra horarios anteriores
     - Este pasa a ser el válido
  ====================================================== */
  async confirmSchedule(scheduleId: string) {
    const schedule = await this.prisma.schedule.findUnique({
      where: { id: scheduleId },
      include: { shifts: true },
    });

    if (!schedule) {
      throw new NotFoundException('Horario no encontrado');
    }

    if (schedule.shifts.length === 0) {
      throw new BadRequestException(
        'El horario no tiene turnos',
      );
    }

    // Cerramos horarios anteriores
    await this.prisma.schedule.updateMany({
      where: {
        userId: schedule.userId,
        validTo: null,
        NOT: { id: schedule.id },
      },
      data: {
        validTo: new Date(),
      },
    });

    // Activamos este
    return this.prisma.schedule.update({
      where: { id: schedule.id },
      data: {
        validFrom: new Date(),
        validTo: null,
      },
    });
  }

  /* ======================================================
     VER HORARIO ACTIVO DE UN EMPLEADO
     (Empleado / Admin)
  ====================================================== */
  async getActiveSchedule(userId: string) {
    return this.prisma.schedule.findFirst({
      where: {
        userId,
        validTo: null,
      },
      include: {
        shifts: true,
        branch: true,
      },
    });
  }
}