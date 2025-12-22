import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';

@Injectable()
export class CompaniesService {
  constructor(private prisma: PrismaService) {}

  /**
   * 📌 LISTAR EMPRESAS
   */
  async findAll(user: any) {
    // SUPERADMIN → TODAS las empresas
    if (user.role === Role.SUPERADMIN) {
      return this.prisma.company.findMany({
        orderBy: { createdAt: 'desc' },
      });
    }

    // ADMIN_EMPRESA → solo empresas donde tiene membership activa
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

  /**
   * 📌 CREAR EMPRESA
   */
  async create(data: any) {
    return this.prisma.company.create({
      data: {
        nif: data.nif,
        legalName: data.legalName,
        commercialName: data.commercialName,
        address: data.address,
        plan: data.plan ?? 'BASIC',
      },
    });
  }
}