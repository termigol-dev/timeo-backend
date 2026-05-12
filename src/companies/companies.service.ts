import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';
import { getPlanConfig } from '../common/plan.utils';

@Injectable()
export class CompaniesService {
  constructor(private prisma: PrismaService) { }

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
            userId: user.sub, // 🔥 IMPORTANTE
            active: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /* ───────── OBTENER MI EMPRESA (CLAVE) ───────── */

  async getMyCompany(user: any) {

    console.log('🔍 TOKEN companyId:', user.companyId);

    const company = await this.prisma.company.findMany();

    console.log('🏢 TODAS LAS EMPRESAS EN DB:', company);

    return company;
  }



  /* ───────── PERFIL ───────── */

  async findOne(companyId: string, user: any) {

    console.log('🧪 USER EN FINDONE:', user);

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      throw new NotFoundException('Empresa no encontrada');
    }

    if (user.role === Role.SUPERADMIN) {
      return company;
    }

    const membership = await this.prisma.membership.findFirst({
      where: {
        companyId,
        userId: user.sub, // 🔥 IMPORTANTE
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

  async getPlanUsage(user: any) {

    const company = await this.prisma.company.findUnique({
      where: { id: user.companyId },
    });

    if (!company) {
      throw new NotFoundException('Empresa no encontrada');
    }

    const config = getPlanConfig(company.plan);

    const employeeCount = await this.prisma.membership.count({
      where: {
        companyId: user.companyId,
        active: true,
      },
    });

    const branchCount = await this.prisma.branch.count({
      where: {
        companyId: user.companyId,
      },
    });

    return {
      company: {
        id: company.id,
        name:
          company.commercialName ||
          company.legalName,
        legalName: company.legalName,
        plan: company.plan,
        subscriptionStatus:
          company.subscriptionStatus,
        billingPeriod:
          company.billingPeriod ||
          'MONTHLY',
        renewalDate:
          company.subscriptionRenewalDate ||
          '12 junio 2026',
        currentPrice: 61,
        paymentMethod: {
          brand: 'visa',
          last4: '4242',
        },
        trialEnd:
          company.trialEnd,
      },
      employees: {
        used: employeeCount,
        limit: config.employees,
      },
      branches: {
        used: branchCount,
        limit: config.branches,
      },
    };
  }

  /* ───────── UPDATE ───────── */

  async update(companyId: string, user: any, data: any) {

    return this.prisma.$transaction(async (tx) => {

      const company = await tx.company.findUnique({
        where: { id: companyId },
      });

      if (!company) {
        throw new NotFoundException('Empresa no encontrada');
      }

      if (
        user.role !== Role.SUPERADMIN &&
        user.role !== Role.ADMIN_EMPRESA
      ) {
        throw new ForbiddenException();
      }

      if (
        user.role === Role.ADMIN_EMPRESA &&
        user.companyId !== companyId
      ) {
        throw new ForbiddenException();
      }

      const payload: any = {
        commercialName: data.commercialName,
        address: data.address,
        plan: data.plan || company.plan || 'FREE',
        logoUrl: data.logoUrl ?? company.logoUrl ?? null,
      };

      if (user.role === Role.SUPERADMIN) {
        payload.legalName = data.legalName;
        payload.nif = data.nif;
      }

      return tx.company.update({
        where: { id: companyId },
        data: payload,
      });

    });
  }

  /* ───────── CREATE ───────── */

  async create(user: any, data: any) {

    return this.prisma.$transaction(async (tx) => {

      const company = await tx.company.create({
        data: {
          legalName: data.legalName,
          commercialName: data.commercialName,
          nif: data.nif,
          address: data.address,
          plan: data.plan || 'BASIC',
          logoUrl: data.logoUrl || null,
          active: true,

          trialStart: new Date(),

          trialEnd: new Date(
            Date.now() + 14 * 24 * 60 * 60 * 1000,
          ),

          subscriptionStatus: 'TRIAL' as any,
        },
      });

      await tx.branch.create({
        data: {
          name: data.branchName || 'Principal',
          address:
            data.branchAddress || data.address,

          companyId: company.id,
          active: true,
        },
      });

      await tx.membership.create({
        data: {
          userId: user.id,
          companyId: company.id,
          role: Role.ADMIN_EMPRESA,
          active: true,
        },
      });

      return {
        company,
        role: Role.ADMIN_EMPRESA,
      };

    });
  }
  /* ───────── DELETE ───────── */

  async remove(companyId: string) {
    return this.prisma.company.delete({
      where: { id: companyId },
    });
  }
}