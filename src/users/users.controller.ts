import {
  Controller,
  Get,
  Patch,
  Post,
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

@Controller('users')
@UseGuards(JwtGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /* ───────── PERFIL PROPIO ───────── */

  @Get('me')
  me(@Req() req) {
    // ✅ usa userId → OK
    return this.usersService.getProfile(req.user.id);
  }

  @Patch('me/password')
  changePassword(@Req() req, @Body() body) {
    // ✅ correcto
    return this.usersService.changePassword(
      req.user.id,
      body.password,
    );
  }

  @Patch('me/photo')
  updatePhoto(@Req() req, @Body() body) {
    // ✅ correcto
    return this.usersService.updatePhoto(
      req.user.id,
      body.photoUrl,
    );
  }

  /* ───────── LISTADO ───────── */

  @UseGuards(RolesGuard)
  @Roles(Role.SUPERADMIN, Role.ADMIN_EMPRESA, Role.ADMIN_SUCURSAL)
  @Get()
  list(@Req() req) {
    // ✅ pasa membership info al service
    return this.usersService.listUsers(req.user);
  }

  /* ───────── CREAR EMPLEADO ───────── */

  @UseGuards(RolesGuard)
  @Roles(Role.SUPERADMIN, Role.ADMIN_EMPRESA, Role.ADMIN_SUCURSAL)
  @Post()
  create(@Req() req, @Body() body) {
    // ✅ correcto
    return this.usersService.create(req.user, body);
  }

  /* ───────── ADMIN ACTIONS ───────── */

  @UseGuards(RolesGuard)
  @Roles(Role.SUPERADMIN, Role.ADMIN_EMPRESA)
  @Patch(':id/role')
  updateRole(@Req() req, @Param('id') id: string, @Body() body) {
    // ✅ ahora actúa sobre Membership
    return this.usersService.updateRole(
      req.user,
      id,
      body.role,
    );
  }

  @UseGuards(RolesGuard)
  @Roles(Role.SUPERADMIN, Role.ADMIN_EMPRESA)
  @Patch(':id/branch')
  updateBranch(
    @Req() req,
    @Param('id') id: string,
    @Body() body,
  ) {
    // ✅ correcto
    return this.usersService.updateBranch(
      req.user,
      id,
      body.branchId,
    );
  }

  @UseGuards(RolesGuard)
  @Roles(Role.SUPERADMIN, Role.ADMIN_EMPRESA, Role.ADMIN_SUCURSAL)
  @Patch(':id/active')
  toggleActive(@Req() req, @Param('id') id: string) {
    // ✅ correcto
    return this.usersService.toggleActive(req.user, id);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.SUPERADMIN, Role.ADMIN_EMPRESA, Role.ADMIN_SUCURSAL)
  @Post(':id/reset-password')
  resetPassword(@Req() req, @Param('id') id: string) {
    // ✅ correcto
    return this.usersService.resetPassword(req.user, id);
  }
}