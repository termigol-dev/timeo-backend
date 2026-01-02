import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RecordType } from '@prisma/client';

@Injectable()
export class TabletService {
  constructor(private readonly prisma: PrismaService) {}

  /* ===============================
     EMPLEADOS DE LA TABLET
  =============================== */
  async getEmployees(branchId: string) {
  return this.prisma.membership.findMany({
    where: {
      branchId,
      active: true,
      user: { active: true },
    },
    include: {
      user: {
        include: {
          records: {
            take: 1,
            orderBy: { createdAt: 'desc' },
          },
        },
      },
    },
    orderBy: {
      user: { firstSurname: 'asc' },
    },
  });
}

  /* ===============================
     ENTRADA
  =============================== */
  async recordIn(userId: string, branchId: string, companyId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: {
        userId,
        companyId,
        branchId,
        active: true,
      },
    });

    if (!membership) {
      throw new BadRequestException('Usuario no pertenece a esta sucursal');
    }

    const last = await this.prisma.record.findFirst({
      where: { membershipId: membership.id },
      orderBy: { createdAt: 'desc' },
    });

    if (last?.type === RecordType.IN) {
      throw new BadRequestException('Already IN');
    }

    return this.prisma.record.create({
      data: {
        type: RecordType.IN,
        user: { connect: { id: userId } },
        company: { connect: { id: companyId } },
        branch: { connect: { id: branchId } },
        membership: { connect: { id: membership.id } },
      },
    });
  }

  /* ===============================
     SALIDA
  =============================== */
  async recordOut(userId: string, branchId: string, companyId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: {
        userId,
        companyId,
        branchId,
        active: true,
      },
    });

    if (!membership) {
      throw new BadRequestException('Usuario no pertenece a esta sucursal');
    }

    const last = await this.prisma.record.findFirst({
      where: { membershipId: membership.id },
      orderBy: { createdAt: 'desc' },
    });

    if (!last || last.type === RecordType.OUT) {
      throw new BadRequestException('No active IN');
    }

    return this.prisma.record.create({
      data: {
        type: RecordType.OUT,
        user: { connect: { id: userId } },
        company: { connect: { id: companyId } },
        branch: { connect: { id: branchId } },
        membership: { connect: { id: membership.id } },
      },
    });
  }
}