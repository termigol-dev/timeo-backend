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

/* ============================================================
   TODOS LOS EMPLEADOS (GLOBAL, SIN companyId)
   GET /users
============================================================ */
@Controller('users')
@UseGuards(JwtGuard, RolesGuard)
export class GlobalUsersController {

  constructor(
    private readonly usersService: UsersService,
  ) {}

  @Get()
  @Roles(Role.SUPERADMIN, Role.ADMIN_EMPRESA, Role.ADMIN_SUCURSAL)
  getAll(@Req() req) {
    return this.usersService.getAllEmployees(req.user);
  }
}

/* ============================================================
   USUARIO POR ID (GLOBAL, SIN companyId)
   GET   /users/:id
   PATCH /users/:id
   POST  /users/:id/photo   (SIN MULTER)
============================================================ */
@Controller('users')
@UseGuards(JwtGuard, RolesGuard)
export class UsersGlobalController {

  constructor(
    private readonly usersService: UsersService,
  ) {}

  @Get(':id')
  @Roles(Role.SUPERADMIN, Role.ADMIN_EMPRESA, Role.ADMIN_SUCURSAL)
  getOne(
    @Req() req,
    @Param('id') id: string,
  ) {
    return this.usersService.getUserById(req.user, id);
  }

  /* ✅ ESTE ES EL QUE TE FALTABA */
  @Patch(':id')
  @Roles(Role.SUPERADMIN, Role.ADMIN_EMPRESA, Role.ADMIN_SUCURSAL)
  update(
    @Req() req,
    @Param('id') id: string,
    @Body() body,
  ) {
    return this.usersService.updateUser(
      req.user,
      id,
      body,
    );
  }

  /*
    👉 Se espera:
    {
      photo: "data:image/jpeg;base64,...."
    }
  */
  @Post(':id/photo')
  @Roles(Role.SUPERADMIN, Role.ADMIN_EMPRESA, Role.ADMIN_SUCURSAL)
  uploadPhoto(
    @Param('id') id: string,
    @Body() body: { photo: string },
  ) {
    return this.usersService.uploadUserPhoto(
      id,
      body.photo,
    );
  }
}

/* ============================================================
   ENDPOINTS POR EMPRESA
   /companies/:companyId/employees
============================================================ */
@Controller('companies/:companyId/employees')
@UseGuards(JwtGuard, RolesGuard)
export class UsersController {

  constructor(
    private readonly usersService: UsersService,
  ) {}

  /* ───────── LISTADO EMPLEADOS EMPRESA ───────── */
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

  /* ───────── PRECHECK BORRADO (INTELIGENTE) ───────── */
  @Get(':id/delete-check')
  @Roles(Role.SUPERADMIN, Role.ADMIN_EMPRESA, Role.ADMIN_SUCURSAL)
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

  /* ───────── BORRADO (INTELIGENTE) ───────── */
  @Delete(':id')
  @Roles(Role.SUPERADMIN, Role.ADMIN_EMPRESA, Role.ADMIN_SUCURSAL)
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

  /* ───────── BORRADO DEFINITIVO (SOLO PRUEBAS) ───────── */
  @Delete(':id/hard')
  @Roles(Role.SUPERADMIN)
  hardDelete(
    @Param('companyId') companyId: string,
    @Param('id') id: string,
  ) {
    return this.usersService.hardDeleteEmployee(
      companyId,
      id,
    );
  }
}