import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

/* ───────── ROLE LEVEL ───────── */

function roleLevel(role: Role) {
  return {
    SUPERADMIN: 4,
    ADMIN_EMPRESA: 3,
    ADMIN_SUCURSAL: 2,
    EMPLEADO: 1,
  }[role];
}

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  /* ───────── PERFIL ───────── */

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: { where: { active: true } },
      },
    });

    if (!user || user.memberships.length === 0) {
      throw new NotFoundException();
    }

    const membership = user.memberships[0];

    return {
      id: user.id,
      name: user.name,
      firstSurname: user.firstSurname,
      secondSurname: user.secondSurname,
      dni: user.dni,
      email: user.email,
      photoUrl: user.photoUrl,
      active: user.active,
      role: membership.role,
      companyId: membership.companyId,
      branchId: membership.branchId,
    };
  }

  async changePassword(userId: string, password: string) {
    const hash = await bcrypt.hash(password, 10);
    return this.prisma.user.update({
      where: { id: userId },
      data: { password: hash },
    });
  }

  async updatePhoto(userId: string, photoUrl: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { photoUrl },
    });
  }

  /* ───────── LISTADO ───────── */

  async listUsers(requestUser: any) {
    const { companyId, branchId, role } = requestUser;

    let users;

    if (role === Role.SUPERADMIN) {
      users = await this.prisma.user.findMany({
        include: { memberships: { where: { active: true } } },
        orderBy: { createdAt: 'desc' },
      });
    } else if (role === Role.ADMIN_EMPRESA) {
      users = await this.prisma.user.findMany({
        where: { memberships: { some: { companyId, active: true } } },
        include: { memberships: { where: { active: true } } },
        orderBy: { createdAt: 'desc' },
      });
    } else if (role === Role.ADMIN_SUCURSAL) {
      users = await this.prisma.user.findMany({
        where: {
          memberships: { some: { companyId, branchId, active: true } },
        },
        include: { memberships: { where: { active: true } } },
        orderBy: { createdAt: 'desc' },
      });
    } else {
      throw new ForbiddenException();
    }

    return users.map(u => {
      const m = u.memberships[0];
      return {
        id: u.id,
        name: u.name,
        firstSurname: u.firstSurname,
        secondSurname: u.secondSurname,
        dni: u.dni,
        email: u.email,
        photoUrl: u.photoUrl,
        active: m?.active ?? false,
        role: m?.role ?? null,
        branchId: m?.branchId ?? null,
        companyId: m?.companyId ?? null,
        createdAt: u.createdAt,
      };
    });
  }

  /* ───────── CREAR EMPLEADO ───────── */

  async create(requestUser: any, body: any) {
    const { companyId, branchId, role } = requestUser;

    let finalBranchId = body.branchId;

    if (role === Role.ADMIN_SUCURSAL) {
      finalBranchId = branchId;
    }

    if (!finalBranchId) {
      throw new ForbiddenException('Sucursal requerida');
    }

    const passwordPlain = Math.random().toString(36).slice(-8);
    const passwordHash = await bcrypt.hash(passwordPlain, 10);

    const user = await this.prisma.user.create({
      data: {
        name: body.name,
        firstSurname: body.firstSurname,
        secondSurname: body.secondSurname || null,
        dni: body.dni,
        email: body.email,
        password: passwordHash,
        active: true,
        memberships: {
          create: {
            companyId,
            branchId: finalBranchId,
            role: Role.EMPLEADO,
            active: true,
          },
        },
      },
    });

    return { id: user.id, email: user.email, password: passwordPlain };
  }

  /* ───────── HELPERS ───────── */

  private async getMembership(userId: string, companyId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: { userId, companyId, active: true },
    });

    if (!membership) {
      throw new NotFoundException();
    }

    return membership;
  }

  /* ───────── ADMIN ACTIONS ───────── */

  async updateRole(requestUser: any, targetUserId: string, newRole: Role) {
    const target = await this.getMembership(
      targetUserId,
      requestUser.companyId,
    );

    if (roleLevel(target.role) >= roleLevel(requestUser.role)) {
      throw new ForbiddenException();
    }

    return this.prisma.membership.update({
      where: { id: target.id },
      data: { role: newRole },
    });
  }

 async updateBranch(requestUser: any, userId: string, branchId: string | null) {
  const target = await this.getMembership(userId, requestUser.companyId);

  if (roleLevel(target.role) >= roleLevel(requestUser.role)) {
    throw new ForbiddenException();
  }

  // 🟡 CASO: Ninguna sucursal → inactivo
  if (!branchId) {
    return this.prisma.membership.update({
      where: { id: target.id },
      data: {
        branchId: null,
        active: false,
      },
    });
  }

  // 🟢 CASO: sucursal asignada → activo
  return this.prisma.membership.update({
    where: { id: target.id },
    data: {
      branchId,
      active: true,
    },
  });
}

  async toggleActive(requestUser: any, userId: string) {
    const target = await this.getMembership(
      userId,
      requestUser.companyId,
    );

    if (roleLevel(target.role) >= roleLevel(requestUser.role)) {
      throw new ForbiddenException();
    }

    return this.prisma.membership.update({
      where: { id: target.id },
      data: { active: !target.active },
    });
  }

  async resetPassword(requestUser: any, userId: string) {
    const target = await this.getMembership(
      userId,
      requestUser.companyId,
    );

    if (roleLevel(target.role) >= roleLevel(requestUser.role)) {
      throw new ForbiddenException();
    }

    const newPassword = Math.random().toString(36).slice(-8);
    const hash = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hash },
    });

    return { password: newPassword };
  }

  /* ───────── PRECHECK BORRADO (CLAVE DE TU MODELO) ───────── */

  async checkDeleteUser(requestUser: any, userId: string) {
    if (requestUser.role !== Role.SUPERADMIN) {
      return {
        canDelete: false,
        mode: 'FORBIDDEN',
        reason: 'Solo el superadmin puede eliminar usuarios',
      };
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: true,
        records: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const hasOtherCompanies = user.memberships.some(
      m => m.companyId !== requestUser.companyId,
    );

    const hasRecords = user.records.length > 0;

    if (hasOtherCompanies) {
      return {
        canDelete: false,
        mode: 'SOFT',
        reason: 'El usuario ha pertenecido a otra empresa',
      };
    }

    if (hasRecords) {
      return {
        canDelete: false,
        mode: 'SOFT',
        reason: 'El usuario tiene registros horarios',
      };
    }

    return {
      canDelete: true,
      mode: 'HARD',
      reason: null,
    };
  }

  /* ───────── BORRADO DEFINITIVO (SOLO SI ES SEGURO) ───────── */

  async deleteUser(requestUser: any, userId: string) {
    const check = await this.checkDeleteUser(requestUser, userId);

    if (!check.canDelete || check.mode !== 'HARD') {
      throw new ForbiddenException(
        check.reason || 'No se puede eliminar el usuario',
      );
    }

    await this.prisma.user.delete({
      where: { id: userId },
    });

    return { success: true };
  }
}