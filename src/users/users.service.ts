import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

/* ───────── CONFIG ───────── */
// 🆕 Email del SuperAdmin (env > fallback)
const SUPERADMIN_EMAIL =
  process.env.SUPERADMIN_EMAIL || 'termigol82@gmail.com';

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

  /* ───────── HELPERS ───────── */

  private async getMembership(
    userId: string,
    companyId: string,
  ) {
    const membership = await this.prisma.membership.findFirst({
      where: { userId, companyId },
    });

    if (!membership) {
      throw new NotFoundException(
        'El usuario no pertenece a esta empresa',
      );
    }

    return membership;
  }

  private ensureCompanyAccess(
    requestUser: any,
    companyId: string,
  ) {
    if (
      requestUser.role !== Role.SUPERADMIN &&
      requestUser.companyId !== companyId
    ) {
      throw new ForbiddenException(
        'No tienes acceso a esta empresa',
      );
    }
  }

  /* ───────── LISTADO EMPLEADOS (ACTIVOS + INACTIVOS) ───────── */

  async listUsersByCompany(
    requestUser: any,
    companyId: string,
  ) {
    this.ensureCompanyAccess(requestUser, companyId);

    const where: any = {
      memberships: {
        some: { companyId },
      },
    };

    if (requestUser.role === Role.ADMIN_SUCURSAL) {
      where.memberships.some.branchId =
        requestUser.branchId;
    }

    const users = await this.prisma.user.findMany({
      where,
      include: {
        memberships: {
          where: { companyId },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

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
        active: m.active,
        role: m.role,
        branchId: m.branchId,
        companyId: m.companyId,
        createdAt: u.createdAt,
      };
    });
  }

  /* ───────── CREAR / REACTIVAR EMPLEADO ───────── */

  async createInCompany(
    requestUser: any,
    companyId: string,
    body: any,
  ) {
    this.ensureCompanyAccess(requestUser, companyId);

    let finalBranchId = body.branchId;

    if (requestUser.role === Role.ADMIN_SUCURSAL) {
      finalBranchId = requestUser.branchId;
    }

    if (!finalBranchId) {
      throw new ForbiddenException(
        'La sucursal es obligatoria',
      );
    }

    /* ────── 🔁 PASO 1.3: REACTIVAR USUARIO ────── */
    if (body.reactivateUserId) {
      if (
        body.dni ||
        body.email ||
        body.name ||
        body.firstSurname ||
        body.secondSurname
      ) {
        throw new ForbiddenException(
          'No se pueden modificar datos personales al reactivar un usuario',
        );
      }

      const membership =
        await this.prisma.membership.findFirst({
          where: {
            userId: body.reactivateUserId,
            companyId,
          },
        });

      if (!membership) {
        throw new NotFoundException(
          'No existe relación previa con esta empresa',
        );
      }

      if (
        requestUser.role === Role.ADMIN_SUCURSAL &&
        membership.branchId !== requestUser.branchId
      ) {
        throw new ForbiddenException(
          'No puedes reactivar usuarios de otra sucursal',
        );
      }

      await this.prisma.membership.update({
        where: { id: membership.id },
        data: {
          active: true,
          branchId: finalBranchId,
          role: body.role ?? membership.role,
        },
      });

      return {
        reactivated: true,
        userId: body.reactivateUserId,
      };
    }

    /* ────── 🔒 PASO 1.4: COMPROBAR EMAIL DUPLICADO ────── */
    if (body.email) {
      const existingEmailUser =
        await this.prisma.user.findFirst({
          where: { email: body.email },
        });

      if (existingEmailUser) {
        throw new ForbiddenException({
          code: 'EMAIL_EXISTS',
          message:
            `Este empleado tiene registros activos en la base de datos. ` +
            `Para modificar el DNI o el email, en este caso, contacta con el SuperAdmin: ${SUPERADMIN_EMAIL}`,
        });
      }
    }

    /* ────── 🔍 PASO 1.1: COMPROBAR DNI ────── */
    if (body.dni) {
      const existingUser =
        await this.prisma.user.findFirst({
          where: { dni: body.dni },
          include: {
            memberships: {
              where: { companyId },
            },
          },
        });

      if (existingUser) {
        const membership = existingUser.memberships[0];

        if (!membership || membership.active === false) {
          throw new ForbiddenException({
            code: 'DNI_INACTIVE',
            message:
              'Existe un usuario con este DNI que está inactivo',
            userId: existingUser.id,
          });
        }

        throw new ForbiddenException({
          code: 'DNI_ACTIVE',
          message:
            `Este empleado tiene registros activos en la base de datos. ` +
            `Para modificar el DNI o el email, en este caso, contacta con el SuperAdmin: ${SUPERADMIN_EMAIL}`,
        });
      }
    }

    /* ────── CREACIÓN NORMAL ────── */

    const passwordPlain = Math.random()
      .toString(36)
      .slice(-8);

    const passwordHash = await bcrypt.hash(body.password, 10);

console.log('🧪 CREATE USER');
console.log('EMAIL:', body.email);
console.log('PASSWORD PLANA:', body.password);
console.log('PASSWORD HASH:', passwordHash);

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
            role: body.role ?? Role.EMPLEADO,
            active: true,
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

  /* ───────── ADMIN ACTIONS ───────── */

  async updateRole(
    requestUser: any,
    companyId: string,
    userId: string,
    newRole: Role,
  ) {
    this.ensureCompanyAccess(requestUser, companyId);

    const target = await this.getMembership(
      userId,
      companyId,
    );

    if (
      roleLevel(target.role) >=
      roleLevel(requestUser.role)
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
    companyId: string,
    userId: string,
    branchId: string | null,
  ) {
    this.ensureCompanyAccess(requestUser, companyId);

    const target = await this.getMembership(
      userId,
      companyId,
    );

    if (
      roleLevel(target.role) >=
      roleLevel(requestUser.role)
    ) {
      throw new ForbiddenException();
    }

    return this.prisma.membership.update({
      where: { id: target.id },
      data: {
        branchId,
        active: !!branchId,
      },
    });
  }

  async toggleActive(
    requestUser: any,
    companyId: string,
    userId: string,
  ) {
    this.ensureCompanyAccess(requestUser, companyId);

    const target = await this.getMembership(
      userId,
      companyId,
    );

    if (
      roleLevel(target.role) >=
      roleLevel(requestUser.role)
    ) {
      throw new ForbiddenException();
    }

    return this.prisma.membership.update({
      where: { id: target.id },
      data: { active: !target.active },
    });
  }

  async resetPassword(
    requestUser: any,
    companyId: string,
    userId: string,
  ) {
    this.ensureCompanyAccess(requestUser, companyId);

    const target = await this.getMembership(
      userId,
      companyId,
    );

    if (
      roleLevel(target.role) >=
      roleLevel(requestUser.role)
    ) {
      throw new ForbiddenException();
    }

    const newPassword = Math.random()
      .toString(36)
      .slice(-8);

    const hash = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hash },
    });

    return { password: newPassword };
  }

  /* ───────── BORRADO DEFINITIVO ───────── */

  async checkDeleteUser(
    requestUser: any,
    companyId: string,
    userId: string,
  ) {
    if (requestUser.role !== Role.SUPERADMIN) {
      return {
        canDelete: false,
        reason: 'Solo SUPERADMIN',
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
      m => m.companyId !== companyId,
    );

    if (hasOtherCompanies || user.records.length > 0) {
      return {
        canDelete: false,
        reason:
          'El usuario tiene historial o pertenece a otra empresa',
      };
    }

    return { canDelete: true };
  }

  async deleteUser(
    requestUser: any,
    companyId: string,
    userId: string,
  ) {
    const check = await this.checkDeleteUser(
      requestUser,
      companyId,
      userId,
    );

    if (!check.canDelete) {
      throw new ForbiddenException(check.reason);
    }

    await this.prisma.user.delete({
      where: { id: userId },
    });

    return { success: true };
  }
}