import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  UseGuards,
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

  /**
   * 📌 LISTAR EMPRESAS
   * - SUPERADMIN → todas
   * - ADMIN_EMPRESA → solo las suyas
   */
  @Get()
  @Roles(Role.SUPERADMIN, Role.ADMIN_EMPRESA)
  findAll(@Req() req) {
    return this.companiesService.findAll(req.user);
  }

  /**
   * 📌 CREAR EMPRESA
   * - SOLO SUPERADMIN
   */
  @Post()
  @Roles(Role.SUPERADMIN)
  create(@Body() body: any) {
    return this.companiesService.create(body);
  }
}