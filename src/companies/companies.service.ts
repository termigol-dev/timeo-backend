import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CompaniesService {
  constructor(private prisma: PrismaService) {}

  async createCompany(data: {
    nif: string;
    legalName: string;        // 👈 NOMBRE LEGAL (facturas)
    commercialName: string;  // 👈 nombre comercial
    address: string;
    plan: string;
  }) {
    return this.prisma.company.create({
      data: {
        nif: data.nif,
        legalName: data.legalName,          // ✅ CORRECTO
        commercialName: data.commercialName,
        address: data.address,
        plan: data.plan,
      },
    });
  }
}