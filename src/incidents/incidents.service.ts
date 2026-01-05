import {
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  IncidentType,
  IncidentBy,
  Role,
} from '@prisma/client';

@Injectable()
export class IncidentsService {
  constructor(private prisma: PrismaService) {}

  /* ======================================================
     LISTAR INCIDENCIAS
     (Admin empresa / sucursal)
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
     - No es disciplinaria
     - No afecta a cálculos
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
        membership: {
          connect: { id: params.membershipId },
        },
        company: {
          connect: { id: params.companyId },
        },
        branch: {
          connect: { id: params.branchId },
        },
      },
    });
  }

  /* ======================================================
     INCIDENCIA AUTOMÁTICA (SISTEMA / EMPLEADO)
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
        membership: {
          connect: { id: params.membershipId },
        },
        company: {
          connect: { id: params.companyId },
        },
        branch: {
          connect: { id: params.branchId },
        },
        record: params.recordId
          ? { connect: { id: params.recordId } }
          : undefined,
      },
    });
  }
}