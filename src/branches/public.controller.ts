import { Controller, Get, Param } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('public')
export class PublicController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('companies/:companyId/branches')
  async getPublicBranches(
    @Param('companyId') companyId: string,
  ) {
    return this.prisma.branch.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
    });
  }
}