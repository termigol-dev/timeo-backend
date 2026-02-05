import {
  Injectable,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';

import cloudinary from '../common/cloudinary';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

/* ───────── CONFIG ───────── */
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
  constructor(private prisma: PrismaService) { }

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

  /* ───────── LISTADO EMPLEADOS EMPRESA ───────── */

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
        photo: u.photo,
        active: m.active,
        role: m.role,
        branchId: m.branchId,
        companyId: m.companyId,
        createdAt: u.createdAt,
      };
    });
  }

  /* ───────── PERFIL GLOBAL (SIN companyId) ───────── */
  async getUserById(
    requestUser: any,
    userId: string,
  ) {

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    // 🔐 Seguridad:
    // si no es superadmin, debe compartir al menos una empresa
    if (requestUser.role !== Role.SUPERADMIN) {

      const belongs = user.memberships.some(
        m => m.companyId === requestUser.companyId,
      );

      if (!belongs) {
        throw new ForbiddenException(
          'No tienes acceso a este usuario',
        );
      }
    }

    // Para devolver datos de perfil usamos
    // la membership de la empresa del usuario logado
    // (o la primera si es superadmin)
    const m =
      requestUser.role === Role.SUPERADMIN
        ? user.memberships[0]
        : user.memberships.find(
          mm => mm.companyId === requestUser.companyId,
        );

    if (!m) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return {
      id: user.id,
      name: user.name,
      firstSurname: user.firstSurname,
      secondSurname: user.secondSurname,
      dni: user.dni,
      email: user.email,
      photo: user.photo,   // ✅ campo real
      role: m.role,
      branchId: m.branchId,
      active: m.active,
      companyId: m.companyId,
    };
  }

  /* ───────── CREAR / REACTIVAR USUARIO ───────── */

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

    if (
      body.role !== Role.ADMIN_EMPRESA &&
      !finalBranchId
    ) {
      throw new ForbiddenException(
        'La sucursal es obligatoria',
      );
    }

    /* ────── REACTIVAR USUARIO ────── */
    if (body.reactivateUserId) {
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

    /* ────── EMAIL DUPLICADO ────── */
    if (body.email) {
      const existingEmailUser =
        await this.prisma.user.findFirst({
          where: { email: body.email },
        });

      if (existingEmailUser) {
        throw new ForbiddenException({
          code: 'EMAIL_EXISTS',
          message:
            `Este email ya existe. Contacta con el SuperAdmin: ${SUPERADMIN_EMAIL}`,
        });
      }
    }

    /* ────── DNI DUPLICADO ────── */
    if (body.dni) {
      const existingUser =
        await this.prisma.user.findFirst({
          where: { dni: body.dni },
        });

      if (existingUser) {
        throw new ForbiddenException({
          code: 'DNI_EXISTS',
          message:
            `Este DNI ya existe. Contacta con el SuperAdmin: ${SUPERADMIN_EMAIL}`,
        });
      }
    }

    /* ────── PASSWORD OBLIGATORIA ────── */
    if (!body.password || body.password.length < 6) {
      throw new ForbiddenException(
        'La contraseña es obligatoria y debe tener al menos 6 caracteres',
      );
    }

    const passwordHash = await bcrypt.hash(body.password, 10);

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
            branchId: finalBranchId ?? null,
            role: body.role ?? Role.EMPLEADO,
            active: true,
          },
        },
      },
    });

    return {
      id: user.id,
      email: user.email,
    };
  }

  /* ───────── LISTADO TODOS LOS EMPLEADOS ───────── */
  async getAllEmployees(requestUser: any) {

    const where: any = {
      memberships: {
        some: {},
      },
    };

    // si no es superadmin, solo su empresa
    if (requestUser.role !== Role.SUPERADMIN) {
      where.memberships.some.companyId = requestUser.companyId;
    }

    const users = await this.prisma.user.findMany({
      where,
      include: {
        memberships: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return users.map(u => {
      const m =
        requestUser.role === Role.SUPERADMIN
          ? u.memberships[0]
          : u.memberships.find(mm => mm.companyId === requestUser.companyId);

      return {
        id: u.id,
        name: u.name,
        firstSurname: u.firstSurname,
        secondSurname: u.secondSurname,
        dni: u.dni,
        email: u.email,
        photo: u.photo,
        role: m?.role,
        branchId: m?.branchId,
        active: m?.active,
        companyId: m?.companyId,
        createdAt: u.createdAt,
      };
    });
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

  async updateUser(
    authUser,
    userId: string,
    data: {
      name?: string;
      firstSurname?: string;
      secondSurname?: string;
      dni?: string;
      email?: string;
    },
  ) {

    console.log('🧠 updateUser service', userId, data);

    // opcional: aquí puedes meter luego control de permisos finos

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        name: data.name,
        firstSurname: data.firstSurname,
        secondSurname: data.secondSurname,
        dni: data.dni,
        email: data.email,
      },
    });
  }
async uploadUserPhoto(
  userId: string,
  base64: string,
) {

  if (!base64) {
    throw new BadRequestException('No se ha enviado ninguna imagen');
  }

  const user = await this.prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new NotFoundException('Usuario no encontrado');
  }

  const result = await cloudinary.uploader.upload(base64, {
    folder: 'timeo/users',
    public_id: userId,
    overwrite: true,
    resource_type: 'image',
    transformation: [
      { width: 512, height: 512, crop: 'fill' },
      { quality: 'auto' },
      { fetch_format: 'auto' },
    ],
  });

  return this.prisma.user.update({
    where: { id: userId },
    data: {
      photo: result.secure_url,
    },
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

  async hardDeleteEmployee(companyId: string, employeeId: string) {
    return this.prisma.$transaction(async prisma => {

      const memberships = await prisma.membership.findMany({
        where: {
          userId: employeeId,
          companyId,
        },
      });

      const membershipIds = memberships.map(m => m.id);

      const schedules = await prisma.schedule.findMany({
        where: { userId: employeeId },
        select: { id: true },
      });

      const scheduleIds = schedules.map(s => s.id);

      await prisma.scheduleException.deleteMany({
        where: { scheduleId: { in: scheduleIds } },
      });

      await prisma.shift.deleteMany({
        where: { scheduleId: { in: scheduleIds } },
      });

      await prisma.schedule.deleteMany({
        where: { id: { in: scheduleIds } },
      });

      await prisma.incident.deleteMany({
        where: { userId: employeeId },
      });

      await prisma.record.deleteMany({
        where: { userId: employeeId },
      });

      await prisma.membership.deleteMany({
        where: { id: { in: membershipIds } },
      });

      await prisma.user.delete({
        where: { id: employeeId },
      });

      return { ok: true };
    });
  }

  /* ───────── BORRADO EMPLEADO (INTELIGENTE) ───────── */

  async checkDeleteUser(
    requestUser: any,
    companyId: string,
    userId: string,
  ) {
    this.ensureCompanyAccess(requestUser, companyId);

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

    const membershipsInOtherCompanies = user.memberships.filter(
      m => m.companyId !== companyId,
    ).length;

    const hasRecords = user.records.length > 0;

    if (membershipsInOtherCompanies > 0) {
      return {
        action: 'REMOVE_MEMBERSHIP',
        message:
          'El empleado pertenece a otras empresas. Se eliminará solo de esta empresa.',
      };
    }

    if (hasRecords) {
      return {
        action: 'DEACTIVATE_USER',
        message:
          'El empleado tiene registros. Será eliminado de la empresa y desactivado.',
      };
    }

    return {
      action: 'DELETE_USER',
      message:
        'El empleado no tiene registros. Será eliminado definitivamente.',
    };
  }

  async deleteUser(
    requestUser: any,
    companyId: string,
    userId: string,
  ) {
    this.ensureCompanyAccess(requestUser, companyId);

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

    const membershipsInOtherCompanies = user.memberships.filter(
      m => m.companyId !== companyId,
    ).length;

    const hasRecords = user.records.length > 0;

    if (membershipsInOtherCompanies > 0) {

      await this.prisma.membership.deleteMany({
        where: {
          userId,
          companyId,
        },
      });

      return { success: true, case: 1 };
    }

    if (hasRecords) {

      await this.prisma.membership.deleteMany({
        where: {
          userId,
          companyId,
        },
      });

      await this.prisma.user.update({
        where: { id: userId },
        data: { active: false },
      });

      return { success: true, case: 2 };
    }

    await this.prisma.membership.deleteMany({
      where: {
        userId,
        companyId,
      },
    });

    await this.prisma.user.delete({
      where: { id: userId },
    });

    return { success: true, case: 3 };
  }
}