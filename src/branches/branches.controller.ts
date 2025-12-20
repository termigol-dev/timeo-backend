import {
  Controller,
  Get,
  Post,
  Patch,
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
  constructor(private branchesService: BranchesService) {}

  @Get()
  @Roles(Role.SUPERADMIN, Role.ADMIN_EMPRESA)
  findAll(@Req() req: any) {
    return this.branchesService.findAll(req.user.companyId);
  }

  @Post()
  @Roles(Role.SUPERADMIN, Role.ADMIN_EMPRESA)
  create(
    @Req() req: any,
    @Body() body: { name: string; address: string },
  ) {
    return this.branchesService.create(req.user.companyId, body);
  }

  @Patch(':id/toggle')
  @Roles(Role.SUPERADMIN, Role.ADMIN_EMPRESA)
  toggle(@Req() req: any, @Param('id') id: string) {
    return this.branchesService.toggleActive(req.user.companyId, id);
  }
}
