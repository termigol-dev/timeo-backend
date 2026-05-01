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
import { PrismaService } from '../prisma/prisma.service';
import { BranchesService } from './branches.service';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('companies/:companyId/branches')
@UseGuards(JwtGuard, RolesGuard)
export class BranchesController {
 constructor(
  private readonly branchesService: BranchesService,
  private readonly prisma: PrismaService,
) {}

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
       LISTAR SUCURSALES AL CREAR EL PRIMER EMPLEADO
    ====================== */
  
  @Get('public')
  async getPublicBranches(@Param('companyId') companyId: string) {
    return this.prisma.branch.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
    });
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
    return this.branchesService.create(
      companyId,
      req.user,
      body,
    );
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
    return this.branchesService.toggleActive(
      companyId,
      id,
      req.user,
    );
  }

  /* =====================
     🔄 REGENERAR TOKEN TABLET (OPCIÓN A)
     - invalida el anterior
     - genera uno nuevo
     - pensado para QR
  ====================== */
  @Post(':id/tablet-token')
  @Roles(Role.SUPERADMIN, Role.ADMIN_EMPRESA)
  regenerateTabletToken(
    @Param('companyId') companyId: string,
    @Param('id') branchId: string,
    @Req() req: any,
  ) {
    return this.branchesService.regenerateTabletToken(
      companyId,
      branchId,
      req.user,
    );
  }

  /* =====================
     🔒 REVOCAR TOKEN TABLET
  ====================== */
  @Delete(':id/tablet-token')
  @Roles(Role.SUPERADMIN, Role.ADMIN_EMPRESA)
  revokeTabletToken(
    @Param('companyId') companyId: string,
    @Param('id') branchId: string,
    @Req() req: any,
  ) {
    return this.branchesService.revokeTabletToken(
      companyId,
      branchId,
      req.user,
    );
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
    @Body()
    body: { mode: 'DELETE_USERS' | 'DEACTIVATE_USERS' },
  ) {
    return this.branchesService.removeBranch(
      companyId,
      id,
      body.mode,
      req.user,
    );
  }
}