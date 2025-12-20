import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

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
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        firstSurname: true,
        secondSurname: true,
        dni: true,
        email: true,
        photoUrl: true,
        active: true,
        memberships: {
          select: {
            id: true,
            role: true,
            companyId: true,
            branchId: true,
            active: true,
          },
        },
      },
    });
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

    if (role === Role.SUPERADMIN) {
      return this.prisma.user.findMany({
        include: { memberships: true },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (role === Role.ADMIN_EMPRESA) {
      return this.prisma.user.findMany({
        where: {
          memberships: {
            some: { companyId },
          },
        },
        include: { memberships: true },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (role === Role.ADMIN_SUCURSAL) {
      return this.prisma.user.findMany({
        where: {
          memberships: {
            some: { companyId, branchId },
          },
        },
        include: { memberships: true },
        orderBy: { createdAt: 'desc' },
      });
    }

    throw new ForbiddenException();
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
        memberships: {
          create: {
            companyId,
            branchId: finalBranchId,
            role: Role.EMPLEADO,
          },
        },
      },
    });

    return {
      id: user.id,
      email: user.email,
      password: passwordPlain,
    };
  }

  /* ───────── HELPERS ───────── */

  private async getMembership(
    userId: string,
    companyId: string,
  ) {
    const membership = await this.prisma.membership.findUnique({
      where: {
        userId_companyId: { userId, companyId },
      },
    });

    if (!membership) throw new NotFoundException();
    return membership;
  }

  /* ───────── ADMIN ACTIONS ───────── */

  async updateRole(
    requestUser: any,
    targetUserId: string,
    newRole: Role,
  ) {
    const target = await this.getMembership(
      targetUserId,
      requestUser.companyId,
    );

    if (
      roleLevel(target.role) >= roleLevel(requestUser.role)
    ) {
      throw new ForbiddenException();
    }

    return this.prisma.membership.update({
      where: { id: target.id },
      data: { role: newRole },
    });
  }

  async updateBranch(
    requestUser: any,
    userId: string,
    branchId: string,
  ) {
    const target = await this.getMembership(
      userId,
      requestUser.companyId,
    );

    if (
      roleLevel(target.role) >= roleLevel(requestUser.role)
    ) {
      throw new ForbiddenException();
    }

    return this.prisma.membership.update({
      where: { id: target.id },
      data: { branchId },
    });
  }

  async toggleActive(requestUser: any, userId: string) {
    const target = await this.getMembership(
      userId,
      requestUser.companyId,
    );

    if (
      roleLevel(target.role) >= roleLevel(requestUser.role)
    ) {
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

    if (
      roleLevel(target.role) >= roleLevel(requestUser.role)
    ) {
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
}