import {
Injectable,
ForbiddenException,
NotFoundException,
} from '@nestjs/common';
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

/* ───────── LISTADO EMPLEADOS ───────── */

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
  
// 🔍 LOGS CRÍTICOS

console.log('🧪 body.password TYPE:', typeof body.password);
console.log('🧪 body.password VALUE:', JSON.stringify(body.password));
console.log('🧪 body.password LENGTH:', body.password?.length);

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
  console.log('🟥 [DELETE] Inicio deleteUser');
  console.log('🟥 companyId:', companyId);
  console.log('🟥 userId:', userId);
  console.log('🟥 requestUser:', {
    id: requestUser.id,
    role: requestUser.role,
    companyId: requestUser.companyId,
  });

  this.ensureCompanyAccess(requestUser, companyId);
  console.log('✅ Paso 1: acceso a empresa validado');

  const user = await this.prisma.user.findUnique({
    where: { id: userId },
    include: {
      memberships: true,
      records: true,
    },
  });

  console.log('✅ Paso 2: usuario cargado:', {
    exists: !!user,
    memberships: user?.memberships?.length,
    records: user?.records?.length,
  });

  if (!user) {
    console.log('❌ Usuario no encontrado');
    throw new NotFoundException('Usuario no encontrado');
  }

  const membershipsInOtherCompanies = user.memberships.filter(
    m => m.companyId !== companyId,
  ).length;

  const hasRecords = user.records.length > 0;

  console.log('ℹ️ membershipsInOtherCompanies:', membershipsInOtherCompanies);
  console.log('ℹ️ hasRecords:', hasRecords);

  /* ───── CASO 1 ───── */
  if (membershipsInOtherCompanies > 0) {
    console.log('🟡 CASO 1: borrar solo membership');

    await this.prisma.membership.deleteMany({
      where: {
        userId,
        companyId,
      },
    });

    console.log('✅ Membership eliminado correctamente');
    return { success: true, case: 1 };
  }

  /* ───── CASO 2 ───── */
  if (hasRecords) {
    console.log('🟠 CASO 2: borrar membership + desactivar usuario');

    await this.prisma.membership.deleteMany({
      where: {
        userId,
        companyId,
      },
    });

    console.log('✅ Membership eliminado');

    await this.prisma.user.update({
      where: { id: userId },
      data: { active: false },
    });

    console.log('✅ Usuario desactivado');
    return { success: true, case: 2 };
  }

  /* ───── CASO 3 ───── */
  console.log('🔴 CASO 3: borrar membership + borrar usuario');

  await this.prisma.membership.deleteMany({
    where: {
      userId,
      companyId,
    },
  });

  console.log('✅ Membership eliminado');

  await this.prisma.user.delete({
    where: { id: userId },
  });

  console.log('✅ Usuario eliminado definitivamente');

  return { success: true, case: 3 };
}
}