import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';

@Injectable()
export class BranchesService {
  constructor(private prisma: PrismaService) {}

  /* =====================
     LISTAR SUCURSALES
  ====================== */
  async findAll(companyId: string, user: any) {
    // SUPERADMIN → puede ver sucursales de cualquier empresa
    if (user.role === Role.SUPERADMIN) {
      return this.prisma.branch.findMany({
        where: { companyId },
        orderBy: { name: 'asc' },
      });
    }

    // ADMIN_EMPRESA → comprobar acceso a la empresa
    const membership = await this.prisma.membership.findFirst({
      where: {
        companyId,
        userId: user.id,
        active: true,
      },
    });

    if (!membership) {
      throw new ForbiddenException(
        'No tienes acceso a esta empresa',
      );
    }

    return this.prisma.branch.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
    });
  }

  /* =====================
     CREAR SUCURSAL
  ====================== */
  async create(
    companyId: string,
    user: any,
    data: { name: string; address?: string },
  ) {
    if (user.role !== Role.SUPERADMIN) {
      const membership = await this.prisma.membership.findFirst({
        where: {
          companyId,
          userId: user.id,
          active: true,
        },
      });

      if (!membership) {
        throw new ForbiddenException(
          'No tienes acceso a esta empresa',
        );
      }
    }

    return this.prisma.branch.create({
      data: {
        name: data.name,
        address: data.address,
        active: true,
        companyId,
      },
    });
  }

  /* =====================
     ACTIVAR / DESACTIVAR
  ====================== */
  async toggleActive(
    companyId: string,
    branchId: string,
    user: any,
  ) {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
    });

    if (!branch || branch.companyId !== companyId) {
      throw new NotFoundException('Sucursal no encontrada');
    }

    if (user.role !== Role.SUPERADMIN) {
      const membership = await this.prisma.membership.findFirst({
        where: {
          companyId,
          userId: user.id,
          active: true,
        },
      });

      if (!membership) {
        throw new ForbiddenException();
      }
    }

    return this.prisma.branch.update({
      where: { id: branchId },
      data: { active: !branch.active },
    });
  }

  /* =====================
     ELIMINAR SUCURSAL
  ====================== */
  async removeBranch(
    companyId: string,
    branchId: string,
    mode: 'DELETE_USERS' | 'DEACTIVATE_USERS',
    user: any,
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

    if (!branch || branch.companyId !== companyId) {
      throw new NotFoundException('Sucursal no encontrada');
    }

    if (user.role !== Role.SUPERADMIN) {
      const membership = await this.prisma.membership.findFirst({
        where: {
          companyId,
          userId: user.id,
          active: true,
        },
      });

      if (!membership) {
        throw new ForbiddenException();
      }
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