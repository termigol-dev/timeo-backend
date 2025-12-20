import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('companies')
@UseGuards(JwtGuard, RolesGuard)
export class CompaniesController {
  constructor(private companiesService: CompaniesService) {}

  @Post()
  @Roles(Role.SUPERADMIN)
  createCompany(@Body() body: any) {
    return this.companiesService.createCompany(body);
  }
}
