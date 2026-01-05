import {
  Injectable,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  RecordType,
  IncidentBy,
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

    return this.prisma.record.create({
      data: {
        type: RecordType.IN,
        userId: params.userId,
        membershipId: membership.id,
        companyId: params.companyId,
        branchId: membership.branchId!,
      },
    });
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

    return this.prisma.record.create({
      data: {
        type: RecordType.OUT,
        userId: params.userId,
        membershipId: membership.id,
        companyId: params.companyId,
        branchId: membership.branchId!,
      },
    });
  }

  /* ======================================================
     📌 INCIDENCIAS PENDIENTES (MÓVIL)
     - Solo las del empleado
     - admitted = false
  ====================================================== */
  async getPendingIncidents(params: {
    userId: string;
    companyId: string;
  }) {
    return this.prisma.incident.findMany({
      where: {
        userId: params.userId,
        companyId: params.companyId,
        admitted: false,
      },
      orderBy: {
        occurredAt: 'desc',
      },
    });
  }

  /* ======================================================
     CONFIRMAR INCIDENCIA (OLVIDO / TARDE / ETC)
  ====================================================== */
  async confirmForgot(params: {
    incidentId: string;
    admitted: boolean;
    userId: string;
  }) {
    const incident = await this.prisma.incident.findUnique({
      where: { id: params.incidentId },
    });

    if (!incident) {
      throw new BadRequestException('Incident not found');
    }

    if (incident.userId !== params.userId) {
      throw new ForbiddenException();
    }

    return this.prisma.incident.update({
      where: { id: params.incidentId },
      data: {
        admitted: params.admitted,
        createdBy: IncidentBy.EMPLOYEE,
      },
    });
  }

  /* ======================================================
     HELPERS
  ====================================================== */

  private async getMembership(params: {
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
}