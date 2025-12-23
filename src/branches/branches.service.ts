import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';

@Injectable()
export class BranchesService {
  constructor(private prisma: PrismaService) {}

  async findAll(companyId: string | null) {
    if (!companyId) {
      // SUPERADMIN → todas las sucursales
      return this.prisma.branch.findMany({
        orderBy: { name: 'asc' },
      });
    }

    return this.prisma.branch.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
    });
  }

  async create(companyId: string, data: { name: string; address?: string }) {
    return this.prisma.branch.create({
      data: {
        name: data.name,
        address: data.address,
        active: true,
        company: {
          connect: { id: companyId },
        },
      },
    });
  }

  async toggleActive(companyId: string | null, branchId: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
    });

    if (!branch) {
      throw new NotFoundException('Sucursal no encontrada');
    }

    if (companyId && branch.companyId !== companyId) {
      throw new NotFoundException('Sucursal no encontrada');
    }

    return this.prisma.branch.update({
      where: { id: branchId },
      data: { active: !branch.active },
    });
  }

  async removeBranch(
    companyId: string | null,
    branchId: string,
    mode: 'DELETE_USERS' | 'DEACTIVATE_USERS',
  ) {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      include: {
        memberships: {
          include: {
            user: {
              include: { memberships: true },
            },
          },
        },
      },
    });

    if (!branch) {
      throw new NotFoundException('Sucursal no encontrada');
    }

    if (companyId && branch.companyId !== companyId) {
      throw new NotFoundException('Sucursal no encontrada');
    }

    const memberships = branch.memberships;

    if (mode === 'DELETE_USERS') {
      for (const membership of memberships) {
        const user = membership.user;

        const otherMemberships = user.memberships.filter(
          m => m.id !== membership.id,
        );

        await this.prisma.membership.delete({
          where: { id: membership.id },
        });

        if (otherMemberships.length === 0) {
          await this.prisma.user.delete({
            where: { id: user.id },
          });
        }
      }
    }

    if (mode === 'DEACTIVATE_USERS') {
      for (const membership of memberships) {
        await this.prisma.membership.update({
          where: { id: membership.id },
          data: {
            active: false,
            branchId: null,
          },
        });
      }
    }

    await this.prisma.branch.delete({
      where: { id: branchId },
    });

    return { success: true };
  }
}