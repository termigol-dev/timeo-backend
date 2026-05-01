import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';

@Injectable()
export class CompaniesService {
  constructor(private prisma: PrismaService) {}

  /* ───────── LISTADO ───────── */

  async findAll(user: any) {
    if (user.role === Role.SUPERADMIN) {
      return this.prisma.company.findMany({
        orderBy: { createdAt: 'desc' },
      });
    }

    return this.prisma.company.findMany({
      where: {
        memberships: {
          some: {
            userId: user.id,
            active: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /* ───────── PERFIL ───────── */

  async findOne(companyId: string, user: any) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      throw new NotFoundException('Empresa no encontrada');
    }

    // SUPERADMIN → acceso total
    if (user.role === Role.SUPERADMIN) {
      return company;
    }

    // ADMIN_EMPRESA → comprobar membership
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

    return company;
  }

  /* ───────── ACTUALIZAR EMPRESA (NUEVO) ───────── */

 async update(
  companyId: string,
  user: any,
  data: any,
) {
  const company = await this.prisma.company.findUnique({
    where: { id: companyId },
  });

  if (!company) {
    throw new NotFoundException('Empresa no encontrada');
  }

  // Permisos base
  if (
    user.role !== Role.SUPERADMIN &&
    user.role !== Role.ADMIN_EMPRESA
  ) {
    throw new ForbiddenException();
  }

  // ADMIN_EMPRESA solo su empresa
  if (
    user.role === Role.ADMIN_EMPRESA &&
    user.companyId !== companyId
  ) {
    throw new ForbiddenException(
      'No tienes permiso para editar esta empresa',
    );
  }

  // Payload seguro
  const payload: any = {
    commercialName: data.commercialName,
    address: data.address,
    plan: data.plan || company.plan || 'FREE',
    logoUrl: data.logoUrl ?? company.logoUrl ?? null, // 👈 añadido
  };

  // 🔐 SOLO SUPERADMIN
  if (user.role === Role.SUPERADMIN) {
    payload.legalName = data.legalName;
    payload.nif = data.nif;
  }

  return this.prisma.company.update({
    where: { id: companyId },
    data: payload,
  });
}


/* ───────── CREAR EMPRESA ───────── */

async create(user: any, data: any) {

  const company = await this.prisma.company.create({
    data: {
      legalName: data.legalName,
      commercialName: data.commercialName,
      nif: data.nif,
      address: data.address,
      plan: data.plan || 'FREE',
      logoUrl: data.logoUrl || null,
      active: true,
    },
  });

  const branch = await this.prisma.branch.create({
    data: {
      name: data.branchName || 'Principal',
      address: data.branchAddress || data.address,
      companyId: company.id,
      active: true,
    },
  });

  await this.prisma.membership.create({
    data: {
      userId: user.id,
      companyId: company.id,
      role: Role.ADMIN_EMPRESA,
      active: true,
    },
  });

  // 🔥 NUEVO: actualizar el usuario
  const updatedUser = await this.prisma.user.update({
    where: { id: user.id },
    data: {
      role: Role.ADMIN_EMPRESA,
      companyId: company.id,
    },
  });

  // 🔥 NUEVO: devolver user + company
  return {
    company,
    user: updatedUser,
  };
}

/* ───────── BORRADO DEFINITIVO ───────── */

async remove(companyId: string) {
  console.log('🗑️ BORRANDO EMPRESA', companyId);

  const company = await this.prisma.company.findUnique({
    where: { id: companyId },
    include: {
      branches: true,
      memberships: {
        include: {
          user: {
            include: {
              memberships: true,
            },
          },
        },
      },
    },
  });

  if (!company) {
    throw new NotFoundException('Empresa no encontrada');
  }

  return this.prisma.$transaction(async tx => {
    console.log('➡️ Borrando sucursales:', company.branches.length);

    await tx.branch.deleteMany({
      where: { companyId },
    });

    console.log('➡️ Procesando memberships:', company.memberships.length);

    for (const membership of company.memberships) {
      const user = membership.user;

      const otherMemberships = user.memberships.filter(
        m => m.companyId !== companyId && m.active,
      );

      await tx.membership.delete({
        where: { id: membership.id },
      });

      if (otherMemberships.length === 0) {
        await tx.user.update({
          where: { id: user.id },
          data: { active: false },
        });
      }
    }

    console.log('➡️ Borrando empresa');

    await tx.company.delete({
      where: { id: companyId },
    });

    console.log('✅ Empresa borrada');

    return { success: true };
  });
}
}