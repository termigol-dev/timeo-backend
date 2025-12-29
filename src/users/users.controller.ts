import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('companies/:companyId/employees')
@UseGuards(JwtGuard, RolesGuard)
export class EmployeesController {
  constructor(private readonly usersService: UsersService) {}

  /* ───────── LISTADO EMPLEADOS ───────── */
  @Get()
  @Roles(Role.SUPERADMIN, Role.ADMIN_EMPRESA, Role.ADMIN_SUCURSAL)
  list(
    @Req() req,
    @Param('companyId') companyId: string,
  ) {
    return this.usersService.listUsersByCompany(
      req.user,
      companyId,
    );
  }

  /* ───────── CREAR EMPLEADO ───────── */
  @Post()
  @Roles(Role.SUPERADMIN, Role.ADMIN_EMPRESA, Role.ADMIN_SUCURSAL)
  create(
    @Req() req,
    @Param('companyId') companyId: string,
    @Body() body,
  ) {
    return this.usersService.createInCompany(
      req.user,
      companyId,
      body,
    );
  }

  /* ───────── CAMBIAR ROL ───────── */
  @Patch(':id/role')
  @Roles(Role.SUPERADMIN, Role.ADMIN_EMPRESA)
  updateRole(
    @Req() req,
    @Param('companyId') companyId: string,
    @Param('id') id: string,
    @Body() body,
  ) {
    return this.usersService.updateRole(
      req.user,
      companyId,
      id,
      body.role,
    );
  }

  /* ───────── CAMBIAR SUCURSAL ───────── */
  @Patch(':id/branch')
  @Roles(Role.SUPERADMIN, Role.ADMIN_EMPRESA)
  updateBranch(
    @Req() req,
    @Param('companyId') companyId: string,
    @Param('id') id: string,
    @Body() body,
  ) {
    return this.usersService.updateBranch(
      req.user,
      companyId,
      id,
      body.branchId,
    );
  }

  /* ───────── ACTIVAR / DESACTIVAR ───────── */
  @Patch(':id/active')
  @Roles(Role.SUPERADMIN, Role.ADMIN_EMPRESA, Role.ADMIN_SUCURSAL)
  toggleActive(
    @Req() req,
    @Param('companyId') companyId: string,
    @Param('id') id: string,
  ) {
    return this.usersService.toggleActive(
      req.user,
      companyId,
      id,
    );
  }

  /* ───────── RESET PASSWORD ───────── */
  @Post(':id/reset-password')
  @Roles(Role.SUPERADMIN, Role.ADMIN_EMPRESA, Role.ADMIN_SUCURSAL)
  resetPassword(
    @Req() req,
    @Param('companyId') companyId: string,
    @Param('id') id: string,
  ) {
    return this.usersService.resetPassword(
      req.user,
      companyId,
      id,
    );
  }

  /* ───────── PRECHECK BORRADO ───────── */
  @Get(':id/delete-check')
  @Roles(Role.SUPERADMIN)
  checkDelete(
    @Req() req,
    @Param('companyId') companyId: string,
    @Param('id') id: string,
  ) {
    return this.usersService.checkDeleteUser(
      req.user,
      companyId,
      id,
    );
  }

  /* ───────── BORRADO DEFINITIVO ───────── */
  @Delete(':id')
  @Roles(Role.SUPERADMIN)
  delete(
    @Req() req,
    @Param('companyId') companyId: string,
    @Param('id') id: string,
  ) {
    return this.usersService.deleteUser(
      req.user,
      companyId,
      id,
    );
  }
}