import {
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  IncidentType,
  IncidentBy,
  Role,
  RecordType,
} from '@prisma/client';
import { SchedulesService } from '../schedules/schedules.service';

@Injectable()
export class IncidentsService {
  constructor(
    private prisma: PrismaService,
    private schedulesService: SchedulesService,
  ) {}

  /* ======================================================
     LISTAR INCIDENCIAS
  ====================================================== */
  async findAll(params: {
    companyId: string;
    branchId?: string;
    userId?: string;
    from?: Date;
    to?: Date;
  }) {
    return this.prisma.incident.findMany({
      where: {
        companyId: params.companyId,
        branchId: params.branchId,
        userId: params.userId,
        occurredAt: {
          gte: params.from,
          lte: params.to,
        },
      },
      orderBy: { occurredAt: 'desc' },
      include: {
        user: true,
        branch: true,
        record: true,
      },
    });
  }

  /* ======================================================
     ➕ AÑADIR NOTA (ADMIN)
  ====================================================== */
  async addAdminNote(params: {
    companyId: string;
    branchId: string;
    userId: string;
    membershipId: string;
    admin: any;
    note: string;
  }) {
    if (
      ![
        Role.ADMIN_EMPRESA,
        Role.ADMIN_SUCURSAL,
        Role.SUPERADMIN,
      ].includes(params.admin.role)
    ) {
      throw new ForbiddenException();
    }

    return this.prisma.incident.create({
      data: {
        type: IncidentType.ADMIN_NOTE,
        createdBy: IncidentBy.ADMIN,
        admitted: true,
        note: params.note,
        occurredAt: new Date(),

        user: { connect: { id: params.userId } },
        membership: { connect: { id: params.membershipId } },
        company: { connect: { id: params.companyId } },
        branch: { connect: { id: params.branchId } },
      },
    });
  }

  /* ======================================================
     CREAR INCIDENCIA AUTOMÁTICA
  ====================================================== */
  async createSystemIncident(params: {
    type: IncidentType;
    createdBy: IncidentBy;
    admitted: boolean;
    expectedAt?: Date;
    userId: string;
    membershipId: string;
    companyId: string;
    branchId: string;
    recordId?: string;
  }) {
    return this.prisma.incident.create({
      data: {
        type: params.type,
        createdBy: params.createdBy,
        admitted: params.admitted,
        expectedAt: params.expectedAt,
        occurredAt: new Date(),

        user: { connect: { id: params.userId } },
        membership: { connect: { id: params.membershipId } },
        company: { connect: { id: params.companyId } },
        branch: { connect: { id: params.branchId } },
        record: params.recordId
          ? { connect: { id: params.recordId } }
          : undefined,
      },
    });
  }

  /* ======================================================
     RESPONDER INCIDENCIA (EMPLEADO)
  ====================================================== */
  async respondToIncident(params: {
    incidentId: string;
    answer: 'YES' | 'NO';
    user: any;
  }) {
    const incident = await this.prisma.incident.findUnique({
      where: { id: params.incidentId },
      include: { record: true },
    });

    if (!incident) {
      throw new ForbiddenException();
    }

    // 🔐 Solo el propio empleado
    if (incident.userId !== params.user.id) {
      throw new ForbiddenException();
    }

    // 🔒 Solo incidencias pendientes
    if (incident.response !== 'PENDING') {
      return incident;
    }

    /* =========================
       IN_EARLY
    ========================= */
    if (incident.type === IncidentType.IN_EARLY) {
      if (params.answer === 'YES') {
        return this.prisma.incident.update({
          where: { id: incident.id },
          data: {
            response: 'ADMITTED',
            admitted: true,
          },
        });
      }

      if (params.answer === 'NO') {
        await this.createSystemIncident({
          type: IncidentType.WRONG_IN,
          createdBy: IncidentBy.EMPLOYEE,
          admitted: true,
          userId: incident.userId,
          membershipId: incident.membershipId,
          companyId: incident.companyId,
          branchId: incident.branchId,
          recordId: incident.recordId ?? undefined,
        });

        await this.prisma.record.create({
          data: {
            type: RecordType.OUT,
            userId: incident.userId,
            membershipId: incident.membershipId,
            companyId: incident.companyId,
            branchId: incident.branchId,
          },
        });

        await this.prisma.incident.delete({
          where: { id: incident.id },
        });

        return { ok: true };
      }
    }

    /* =========================
       OUT_EARLY
    ========================= */
    if (incident.type === IncidentType.OUT_EARLY) {
      if (params.answer === 'YES') {
        await this.createSystemIncident({
          type: IncidentType.WRONG_OUT,
          createdBy: IncidentBy.EMPLOYEE,
          admitted: true,
          userId: incident.userId,
          membershipId: incident.membershipId,
          companyId: incident.companyId,
          branchId: incident.branchId,
          recordId: incident.recordId ?? undefined,
        });

        await this.prisma.record.create({
          data: {
            type: RecordType.IN,
            userId: incident.userId,
            membershipId: incident.membershipId,
            companyId: incident.companyId,
            branchId: incident.branchId,
          },
        });

        await this.prisma.incident.delete({
          where: { id: incident.id },
        });

        return { ok: true };
      }

      if (params.answer === 'NO') {
        return this.prisma.incident.update({
          where: { id: incident.id },
          data: {
            response: 'ADMITTED',
            admitted: true,
          },
        });
      }
    }

    /* =========================
       OUT_LATE (15 min)
    ========================= */
    if (incident.type === IncidentType.OUT_LATE) {
      if (params.answer === 'YES') {
        // Sigue trabajando → no se toca nada
        return this.prisma.incident.update({
          where: { id: incident.id },
          data: {
            response: 'ADMITTED',
          },
        });
      }

      if (params.answer === 'NO') {
        // Se olvidó → FORGOT_OUT + OUT automático
        await this.createSystemIncident({
          type: IncidentType.FORGOT_OUT,
          createdBy: IncidentBy.EMPLOYEE,
          admitted: true,
          userId: incident.userId,
          membershipId: incident.membershipId,
          companyId: incident.companyId,
          branchId: incident.branchId,
        });

        await this.prisma.record.create({
          data: {
            type: RecordType.OUT,
            userId: incident.userId,
            membershipId: incident.membershipId,
            companyId: incident.companyId,
            branchId: incident.branchId,
          },
        });

        return { ok: true };
      }
    }

    /* =========================
       FORGOT_OUT (3h)
    ========================= */
    if (incident.type === IncidentType.FORGOT_OUT) {
      if (params.answer === 'YES') {
        // Sigue trabajando → no se elimina
        return { ok: true };
      }

      if (params.answer === 'NO') {
        await this.prisma.record.create({
          data: {
            type: RecordType.OUT,
            userId: incident.userId,
            membershipId: incident.membershipId,
            companyId: incident.companyId,
            branchId: incident.branchId,
          },
        });

        return { ok: true };
      }
    }

    return incident;
  }
}