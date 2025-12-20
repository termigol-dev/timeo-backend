import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RecordType } from '@prisma/client';

@Injectable()
export class RecordsService {
  constructor(private prisma: PrismaService) {}

  /* ===============================
     ENTRADA
  =============================== */
  async recordIn(
    userId: string,
    companyId: string,
    branchId: string,
  ) {
    // 🔑 Buscar membership activa
    const membership = await this.prisma.membership.findFirst({
      where: {
        userId,
        companyId,
        branchId,
        active: true,
      },
    });

    if (!membership) {
      throw new BadRequestException('No tienes acceso a esta sucursal');
    }

    const last = await this.prisma.record.findFirst({
      where: { membershipId: membership.id },
      orderBy: { createdAt: 'desc' },
    });

    if (last?.type === RecordType.IN) {
      throw new BadRequestException('Ya estás dentro');
    }

    return this.prisma.record.create({
      data: {
        type: RecordType.IN,
        user: { connect: { id: userId } },
        company: { connect: { id: companyId } },
        branch: { connect: { id: branchId } },
        membership: { connect: { id: membership.id } }, // 🔥 CLAVE
      },
    });
  }

  /* ===============================
     SALIDA
  =============================== */
  async recordOut(
    userId: string,
    companyId: string,
    branchId: string,
  ) {
    const membership = await this.prisma.membership.findFirst({
      where: {
        userId,
        companyId,
        branchId,
        active: true,
      },
    });

    if (!membership) {
      throw new BadRequestException('No tienes acceso a esta sucursal');
    }

    const last = await this.prisma.record.findFirst({
      where: { membershipId: membership.id },
      orderBy: { createdAt: 'desc' },
    });

    if (!last || last.type === RecordType.OUT) {
      throw new BadRequestException('No puedes salir');
    }

    return this.prisma.record.create({
      data: {
        type: RecordType.OUT,
        user: { connect: { id: userId } },
        company: { connect: { id: companyId } },
        branch: { connect: { id: branchId } },
        membership: { connect: { id: membership.id } }, // 🔥 CLAVE
      },
    });
  }

  /* ===============================
     HISTORIAL
  =============================== */
  async getHistory(userId: string, companyId: string) {
    return this.prisma.record.findMany({
      where: {
        userId,
        companyId,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}