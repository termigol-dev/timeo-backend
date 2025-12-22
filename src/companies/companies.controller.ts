import {
  Controller,
  Get,
  Post,
  Param,
  Req,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('companies')
@UseGuards(JwtGuard, RolesGuard)
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  // LISTADO
  @Get()
  @Roles(Role.SUPERADMIN, Role.ADMIN_EMPRESA)
  findAll(@Req() req) {
    return this.companiesService.findAll(req.user);
  }

  // PERFIL DE EMPRESA 👇 (ESTO FALTABA)
  @Get(':id')
  @Roles(Role.SUPERADMIN, Role.ADMIN_EMPRESA)
  async findOne(@Param('id') id: string, @Req() req) {
    const company = await this.companiesService.findOne(id, req.user);
  if (!company) {
    throw new NotFoundException('Empresa no encontrada');
  }

  return company;

  }
}