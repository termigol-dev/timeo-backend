import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { BranchesService } from './branches.service';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('companies/:companyId/branches')
@UseGuards(JwtGuard, RolesGuard)
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  /* =====================
     LISTAR SUCURSALES
  ====================== */
  @Get()
  @Roles(Role.SUPERADMIN, Role.ADMIN_EMPRESA)
  findAll(
    @Param('companyId') companyId: string,
    @Req() req: any,
  ) {
    return this.branchesService.findAll(companyId, req.user);
  }

  /* =====================
     CREAR SUCURSAL
  ====================== */
  @Post()
  @Roles(Role.SUPERADMIN, Role.ADMIN_EMPRESA)
  create(
    @Param('companyId') companyId: string,
    @Req() req: any,
    @Body() body: { name: string; address?: string },
  ) {
    return this.branchesService.create(companyId, req.user, body);
  }

  /* =====================
     ACTIVAR / DESACTIVAR
  ====================== */
  @Patch(':id/active')
  @Roles(Role.SUPERADMIN, Role.ADMIN_EMPRESA)
  toggle(
    @Param('companyId') companyId: string,
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.branchesService.toggleActive(companyId, id, req.user);
  }

  /* =====================
     ELIMINAR SUCURSAL
  ====================== */
  @Delete(':id')
  @Roles(Role.SUPERADMIN, Role.ADMIN_EMPRESA)
  remove(
    @Param('companyId') companyId: string,
    @Param('id') id: string,
    @Req() req: any,
    @Body() body: { mode: 'DELETE_USERS' | 'DEACTIVATE_USERS' },
  ) {
    return this.branchesService.removeBranch(
      companyId,
      id,
      body.mode,
      req.user,
    );
  }
}