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
        photoUrl: u.photoUrl,
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
        memberships: {
          include: {
            company: true, // 🔥 AÑADIDO
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    // 🔐 Seguridad
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
      photoUrl: user.photoUrl,
      role: m.role,
      branchId: m.branchId,
      active: m.active,
      companyId: m.companyId,

      // 🔥 NUEVO (CLAVE)
      companyName: m.company?.commercialName || null,
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
        photoUrl: u.photoUrl,
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
      password?: string;
    },
  ) {

    console.log('🧠 updateUser service', userId, data);

    // 🔧 Construimos objeto seguro (sin password aún)
    const updateData: any = {
      name: data.name,
      firstSurname: data.firstSurname,
      secondSurname: data.secondSurname,
      dni: data.dni,
      email: data.email,
    };

    // 🔐 Si viene password → la hasheamos
    if (data.password && data.password.trim() !== '') {

      const cleanPassword = data.password.trim();

      console.log('🧪 PASSWORD LIMPIA:', cleanPassword);

      const hashed = await bcrypt.hash(cleanPassword, 10);

      console.log('🧪 HASH GENERADO:', hashed);

      updateData.password = hashed;
    }

    console.log('🧪 DATA FINAL A GUARDAR:', updateData);

    return this.prisma.user.update({
      where: { id: userId },
      data: updateData,
    });
  }

  async uploadUserPhoto(
    userId: string,
    base64: string,
  ) {

    console.log('🧩 uploadUserPhoto service - start', {
      userId,
      base64Length: base64?.length,
    });

    if (!base64) {
      throw new BadRequestException('No se ha enviado ninguna imagen');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    console.log('🧩 uploadUserPhoto service - user found', {
      id: user.id,
    });

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

    console.log('🧩 uploadUserPhoto service - cloudinary result', {
      secure_url: result.secure_url,
    });

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        photoUrl: result.secure_url,
      },
    });

    console.log('🧩 uploadUserPhoto service - saved user', {
      id: updated.id,
      photoUrl: updated.photoUrl,
    });

    return updated;
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

      // ✅ 1️⃣ blocks primero (CLAVE)
      await prisma.scheduleExceptionBlock.deleteMany({
        where: {
          exception: {
            scheduleId: { in: scheduleIds },
          },
        },
      });

      // ✅ 2️⃣ exceptions
      await prisma.scheduleException.deleteMany({
        where: { scheduleId: { in: scheduleIds } },
      });

      // ✅ 3️⃣ shifts
      await prisma.shift.deleteMany({
        where: { scheduleId: { in: scheduleIds } },
      });

      // ✅ 4️⃣ schedules
      await prisma.schedule.deleteMany({
        where: { id: { in: scheduleIds } },
      });

      // ✅ 5️⃣ incidents
      await prisma.incident.deleteMany({
        where: { userId: employeeId },
      });

      // ✅ 6️⃣ records
      await prisma.record.deleteMany({
        where: { userId: employeeId },
      });

      // ✅ 7️⃣ membership
      await prisma.membership.deleteMany({
        where: { id: { in: membershipIds } },
      });

      // ✅ 8️⃣ user
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
    console.log('🧨 ===============================');
    console.log('🧨 DELETE USER START');
    console.log('🧨 ===============================');
    console.log('INPUT:', {
      companyId,
      userId,
      role: requestUser?.role,
    });

    try {
      this.ensureCompanyAccess(requestUser, companyId);

      // 🔍 FETCH USER
      console.log('🔍 FETCH USER START');

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          memberships: true,
          records: true,
        },
      });

      console.log('🔍 FETCH USER END');

      if (!user) {
        console.log('❌ Usuario no encontrado');
        throw new NotFoundException('Usuario no encontrado');
      }

      const membership = user.memberships.find(m => m.companyId === companyId);

      if (!membership) {
        console.log('❌ Membership no encontrada');
        throw new NotFoundException('Membership no encontrada');
      }

      const membershipsInOtherCompanies = user.memberships.filter(
        m => m.companyId !== companyId,
      ).length;

      const hasRecords = user.records.length > 0;

      console.log('📊 USER STATE', {
        membershipsInOtherCompanies,
        hasRecords,
        memberships: user.memberships.length,
        records: user.records.length,
      });

      // 📅 FECHAS
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      console.log('📅 FECHAS', { today, yesterday });

      // 🧠 SHIFT CHECK
      console.log('🧠 SHIFT CHECK START');

      const workedShift = await this.prisma.shift.findFirst({
        where: {
          schedule: {
            userId: userId,
          },
          validFrom: {
            lte: today,
          },
        },
      });

      const hasWorkedShifts = !!workedShift;

      console.log('🧠 SHIFT CHECK RESULT', {
        hasWorkedShifts,
        workedShiftId: workedShift?.id,
      });

      const hasLived = hasRecords || hasWorkedShifts;

      console.log('🧠 FINAL DECISION INPUT', {
        hasRecords,
        hasWorkedShifts,
        hasLived,
      });

      // 🧹 LIMPIEZA FUTURO
      console.log('🧹 ===============================');
      console.log('🧹 LIMPIEZA FUTURO START');

      // 🔒 cerrar turnos activos/pasados
      console.log('➡️ UPDATE SHIFTS (CLOSE) START');

      const closedShifts = await this.prisma.shift.updateMany({
        where: {
          schedule: {
            userId: userId,
          },
          validFrom: {
            lte: today,
          },
        },
        data: {
          validTo: yesterday,
        },
      });

      console.log('🔒 SHIFTS CERRADOS:', closedShifts.count);

      // 🗑️ borrar futuros
      console.log('➡️ DELETE FUTURE SHIFTS START');

      const deletedFutureShifts = await this.prisma.shift.deleteMany({
        where: {
          schedule: {
            userId: userId,
          },
          validFrom: {
            gt: today,
          },
        },
      });

      console.log('🗑️ SHIFTS FUTUROS BORRADOS:', deletedFutureShifts.count);

      console.log('➡️ DELETE EXCEPTION BLOCKS START');

      const deletedBlocks = await this.prisma.scheduleExceptionBlock.deleteMany({
        where: {
          exception: {
            schedule: {
              userId: userId,
            },
          },
        },
      });

      console.log('🗑️ BLOCKS BORRADOS:', deletedBlocks.count);

      // 🗑️ excepciones
      console.log('➡️ DELETE FUTURE EXCEPTIONS START');

      const deletedExceptions = await this.prisma.scheduleException.deleteMany({
        where: {
          schedule: {
            userId: userId,
          },
          date: {
            gt: today,
          },
        },
      });

      console.log('🗑️ EXCEPCIONES BORRADAS:', deletedExceptions.count);

      console.log('🧹 LIMPIEZA FUTURO END');
      console.log('🧹 ===============================');

      // 🔀 DECISIÓN
      console.log('🔀 ===============================');
      console.log('🔀 DECISION ENGINE');

      // ⚠️ REGLA CRÍTICA: si hay records → NO borrar membership
      if (hasRecords) {
        console.log('🔴 CASO: SOFT DELETE (TIENE RECORDS)');

        console.log('➡️ UPDATE MEMBERSHIP START');

        await this.prisma.membership.updateMany({
          where: {
            userId,
            companyId,
          },
          data: {
            active: false,
          },
        });

        console.log('➡️ UPDATE USER START');

        await this.prisma.user.update({
          where: { id: userId },
          data: { active: false },
        });

        console.log('✅ RESULT: SOFT DELETE');

        return { success: true, case: 'SOFT_DELETE' };
      }

      if (membershipsInOtherCompanies > 0) {
        console.log('🟡 CASO: REMOVE MEMBERSHIP (SIN RECORDS)');

        console.log('➡️ DELETE MEMBERSHIP START');

        await this.prisma.membership.deleteMany({
          where: {
            userId,
            companyId,
          },
        });

        console.log('✅ RESULT: REMOVE MEMBERSHIP');

        return { success: true, case: 'REMOVE_MEMBERSHIP' };
      }

      if (hasLived) {
        console.log('🔴 CASO: SOFT DELETE (POR SHIFTS)');

        await this.prisma.membership.updateMany({
          where: {
            userId,
            companyId,
          },
          data: {
            active: false,
          },
        });

        await this.prisma.user.update({
          where: { id: userId },
          data: { active: false },
        });

        return { success: true, case: 'SOFT_DELETE' };
      }

      console.log('🟢 CASO: HARD DELETE');

      console.log('➡️ DELETE MEMBERSHIP START');

      await this.prisma.membership.deleteMany({
        where: {
          userId,
          companyId,
        },
      });

      console.log('➡️ DELETE USER START');

      await this.prisma.user.delete({
        where: { id: userId },
      });

      console.log('✅ RESULT: HARD DELETE');

      return { success: true, case: 'HARD_DELETE' };

    } catch (error) {
      console.log('💥 ===============================');
      console.log('💥 DELETE USER ERROR');
      console.log('💥 ===============================');

      console.error('ERROR MESSAGE:', error.message);
      console.error('STACK:', error.stack);

      throw error;
    }
  }
}