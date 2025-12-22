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
}