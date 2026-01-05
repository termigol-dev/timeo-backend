import {
  Injectable,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  RecordType,
  IncidentBy,
  IncidentType,
} from '@prisma/client';



@Injectable()
export class MobileService {
  constructor(private prisma: PrismaService) {}

  /* ======================================================
     ESTADO ACTUAL DEL EMPLEADO
  ====================================================== */
  async getStatus(params: {
    userId: string;
    companyId: string;
  }) {
    const membership = await this.prisma.membership.findFirst({
      where: {
        userId: params.userId,
        companyId: params.companyId,
        active: true,
      },
    });

    if (!membership) {
      throw new BadRequestException('No membership');
    }

    const lastRecord = await this.prisma.record.findFirst({
      where: { membershipId: membership.id },
      orderBy: { createdAt: 'desc' },
    });

    return {
      status: lastRecord?.type ?? RecordType.OUT,
      lastRecord,
    };
  }

  /* ======================================================
     CHECK-IN
  ====================================================== */
  async recordIn(params: {
    userId: string;
    companyId: string;
  }) {
    const membership = await this.getMembership(params);

    const last = await this.getLastRecord(membership.id);
    if (last?.type === RecordType.IN) {
      throw new BadRequestException('Already IN');
    }

    // 1️⃣ Crear siempre el IN
    const record = await this.prisma.record.create({
      data: {
        type: RecordType.IN,
        userId: params.userId,
        membershipId: membership.id,
        companyId: params.companyId,
        branchId: membership.branchId!,
      },
    });

    // 2️⃣ ¿Hay horario hoy?
    const hasScheduleToday = await this.hasScheduleToday({
      userId: params.userId,
      branchId: membership.branchId!,
    });

    // 3️⃣ NO hay horario → pedir confirmación (sin crear incidencia)
    if (!hasScheduleToday) {
      return {
        record,
        requiresConfirmation: true,
        message:
          'Hemos registrado tu entrada. No tenías horario laboral asignado para hoy a esta hora.',
        question: '¿Estás trabajando?',
      };
    }

    return {
      record,
      requiresConfirmation: false,
      message: 'Hemos registrado tu entrada.',
    };
  }

  /* ======================================================
     CHECK-OUT
  ====================================================== */
  async recordOut(params: {
    userId: string;
    companyId: string;
  }) {
    const membership = await this.getMembership(params);

    const last = await this.getLastRecord(membership.id);
    if (!last || last.type === RecordType.OUT) {
      throw new BadRequestException('No active IN');
    }

    const record = await this.prisma.record.create({
      data: {
        type: RecordType.OUT,
        userId: params.userId,
        membershipId: membership.id,
        companyId: params.companyId,
        branchId: membership.branchId!,
      },
    });

    return {
      record,
      message: 'De acuerdo, queda registrado en el sistema.',
    };
  }

  /* ======================================================
     CONFIRMACIÓN CASO "NO HAY HORARIO"
     - admitted = true  → está trabajando → todo OK
     - admitted = false → WRONG_IN + OUT automático
  ====================================================== */
  async confirmForgot(params: {
    admitted: boolean;
    userId: string;
  }) {
    const membership = await this.getMembership({
      userId: params.userId,
      companyId: undefined as any, // se resuelve por relación
    });

    const lastRecord = await this.getLastRecord(membership.id);
    if (!lastRecord || lastRecord.type !== RecordType.IN) {
      throw new BadRequestException('No active IN');
    }

    // 🟢 Dice que SÍ está trabajando → no pasa nada
    if (params.admitted === true) {
      return {
        message: 'De acuerdo. Todo en orden.',
      };
    }

    // 🔴 Dice que NO está trabajando
    // 1️⃣ Crear incidencia WRONG_IN
    await this.prisma.incident.create({
      data: {
        type: IncidentType.WRONG_IN,
        createdBy: IncidentBy.EMPLOYEE,
        admitted: true,
        userId: params.userId,
        membershipId: membership.id,
        companyId: membership.companyId,
        branchId: membership.branchId!,
        recordId: lastRecord.id,
      },
    });

    // 2️⃣ Registrar OUT automático
    await this.prisma.record.create({
      data: {
        type: RecordType.OUT,
        userId: params.userId,
        membershipId: membership.id,
        companyId: membership.companyId,
        branchId: membership.branchId!,
      },
    });

    return {
      message:
        'Queda registrado en el sistema. Te registro como OUT.',
    };
  }

  /* ======================================================
     HELPERS
  ====================================================== */

  private async getMembership(params: {
    userId: string;
    companyId: string | undefined;
  }) {
    const membership = await this.prisma.membership.findFirst({
      where: {
        userId: params.userId,
        ...(params.companyId
          ? { companyId: params.companyId }
          : {}),
        active: true,
      },
    });

    if (!membership || !membership.branchId) {
      throw new BadRequestException('Invalid membership');
    }

    return membership;
  }

  private async getLastRecord(membershipId: string) {
    return this.prisma.record.findFirst({
      where: { membershipId },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async hasScheduleToday(params: {
    userId: string;
    branchId: string;
  }) {
    const today = new Date();
    const weekday = today.getDay() === 0 ? 7 : today.getDay();

    const schedule = await this.prisma.schedule.findFirst({
      where: {
        userId: params.userId,
        branchId: params.branchId,
        validFrom: { lte: today },
        OR: [{ validTo: null }, { validTo: { gte: today } }],
        shifts: {
          some: { weekday },
        },
      },
    });

    return Boolean(schedule);
  }

   async getMySchedule(params: {
  userId: string;
  companyId: string;
}) {
  const membership = await this.getMembership(params);

  const schedule = await this.prisma.schedule.findFirst({
    where: {
      userId: params.userId,
      branchId: membership.branchId!,
      OR: [
        { validTo: null },
        { validTo: { gte: new Date() } },
      ],
    },
    include: {
      shifts: true,
    },
  });

  return {
    shifts: schedule?.shifts ?? [],
  };
}


}