import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BranchesService {
  constructor(private prisma: PrismaService) {}

  async findAll(companyId: string) {
    return this.prisma.branch.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
    });
  }

  async create(companyId: string, data: { name: string; address: string }) {
    return this.prisma.branch.create({
      data: {
        name: data.name,
        address: data.address,
        active: true,
        company: {
          connect: { id: companyId },
        },
      },
    });
  }

  async toggleActive(companyId: string, branchId: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, companyId },
    });

    if (!branch) {
      throw new NotFoundException('Sucursal no encontrada');
    }

    return this.prisma.branch.update({
      where: { id: branchId },
      data: { active: !branch.active },
    });
  }
}
