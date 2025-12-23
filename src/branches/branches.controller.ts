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

@Controller('branches')
@UseGuards(JwtGuard, RolesGuard)
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  /* =====================
     LISTAR SUCURSALES
  ====================== */
  @Get()
  @Roles(Role.SUPERADMIN, Role.ADMIN_EMPRESA)
  findAll(@Req() req: any) {
    return this.branchesService.findAll(req.user.companyId);
  }

  /* =====================
     CREAR SUCURSAL
  ====================== */
  @Post()
  @Roles(Role.SUPERADMIN, Role.ADMIN_EMPRESA)
  create(
    @Req() req: any,
    @Body() body: { name: string; address?: string },
  ) {
    return this.branchesService.create(req.user.companyId, body);
  }

  /* =====================
     ACTIVAR / DESACTIVAR
  ====================== */
  @Patch(':id/toggle')
  @Roles(Role.SUPERADMIN, Role.ADMIN_EMPRESA)
  toggle(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.branchesService.toggleActive(req.user.companyId, id);
  }

  /* =====================
     ELIMINAR SUCURSAL
     mode:
     - DELETE_USERS
     - DEACTIVATE_USERS
  ====================== */
  @Delete(':id')
  @Roles(Role.SUPERADMIN, Role.ADMIN_EMPRESA)
  remove(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { mode: 'DELETE_USERS' | 'DEACTIVATE_USERS' },
  ) {
    return this.branchesService.removeBranch(
      req.user.companyId,
      id,
      body.mode,
    );
  }
}