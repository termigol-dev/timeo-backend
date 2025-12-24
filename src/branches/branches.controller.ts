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
    @Req() req: any,
    @Param('companyId') companyId: string,
  ) {
    return this.branchesService.findAll(companyId, req.user);
  }

  /* =====================
     CREAR SUCURSAL
  ====================== */
  @Post()
  @Roles(Role.SUPERADMIN, Role.ADMIN_EMPRESA)
  create(
    @Req() req: any,
    @Param('companyId') companyId: string,
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
    @Req() req: any,
    @Param('companyId') companyId: string,
    @Param('id') id: string,
  ) {
    return this.branchesService.toggleActive(companyId, id, req.user);
  }

  /* =====================
     ELIMINAR SUCURSAL
  ====================== */
  @Delete(':id')
  @Roles(Role.SUPERADMIN, Role.ADMIN_EMPRESA)
  remove(
    @Req() req: any,
    @Param('companyId') companyId: string,
    @Param('id') id: string,
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