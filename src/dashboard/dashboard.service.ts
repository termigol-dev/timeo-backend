import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getDashboard(user: {
    role: Role;
    companyId?: string;
    branchId?: string;
  }) {
    /* ───────── SUPERADMIN ───────── */
    if (user.role === Role.SUPERADMIN) {
      const companies = await this.prisma.company.count();
      const users = await this.prisma.user.count();

      return {
        role: user.role,
        companies,
        users,
      };
    }

    /* ───────── ADMIN EMPRESA ───────── */
    if (user.role === Role.ADMIN_EMPRESA) {
      if (!user.companyId) {
        return { role: user.role };
      }

      const branches = await this.prisma.branch.count({
        where: { companyId: user.companyId },
      });

      const users = await this.prisma.membership.count({
        where: {
          companyId: user.companyId,
          active: true,
        },
      });

      return {
        role: user.role,
        branches,
        users,
      };
    }

    /* ───────── ADMIN SUCURSAL ───────── */
    if (user.role === Role.ADMIN_SUCURSAL) {
      if (!user.companyId || !user.branchId) {
        return { role: user.role };
      }

      const users = await this.prisma.membership.count({
        where: {
          companyId: user.companyId,
          branchId: user.branchId,
          active: true,
        },
      });

      return {
        role: user.role,
        users,
      };
    }

    /* ───────── EMPLEADO ───────── */
    return { role: user.role };
  }
}