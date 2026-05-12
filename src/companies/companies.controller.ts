import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Req,
  Body,
  UseGuards,
  NotFoundException,
  Delete,
} from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { PlanGuard } from '../auth/guards/plan.guard';
import { Plan } from '../auth/decorators/plan.decorator';

@Controller('companies')
@UseGuards(JwtGuard, RolesGuard)
export class CompaniesController {
  constructor(
    private readonly companiesService: CompaniesService,
  ) {}
   
  /* ───────── TEST PLAN PRO (CLAVE) ───────── */

  @Get('test-pro')
  @UseGuards(JwtGuard, PlanGuard)
  @Plan('PRO')
  test(@Req() req) {
   return { ok: true };
  }
  
  /* ─────────SABER PLAN ───────── */
  
  @Get('plan-usage')
  @UseGuards(JwtGuard)
  getPlanUsage(@Req() req) {
   return this.companiesService.getPlanUsage(req.user);
  }
  
  /* ───────── LISTADO ───────── */

  @Get()
  @Roles(Role.SUPERADMIN, Role.ADMIN_EMPRESA)
  findAll(@Req() req) {
    return this.companiesService.findAll(req.user);
  }

    /* ───────── ACTUALIZAR EMPRESA ───────── */

  @Patch(':id')
  @Roles(Role.SUPERADMIN, Role.ADMIN_EMPRESA)
  async update(
    @Req() req,
    @Param('id') id: string,
    @Body() body,
  ) {
    const company = await this.companiesService.update(
      id,
      req.user,
      body,
    );

    if (!company) {
      throw new NotFoundException('Empresa no encontrada');
    }

    return company;
  }

  

  /* ───────── CREAR EMPRESA ───────── */
  
  @Post()
  @UseGuards(JwtGuard)
  async create(@Req() req, @Body() body) {
    const result = await this.companiesService.create(req.user, body);
    return result.company;
  }

  /* ───────── BORRADO ───────── */

  @Delete(':id')
  @Roles(Role.SUPERADMIN)
  async remove(@Param('id') id: string) {
    return this.companiesService.remove(id);
  }

  /* ───────── PERFIL EMPRESA ───────── */

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