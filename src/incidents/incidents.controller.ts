import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  Param,
  UseGuards,
} from '@nestjs/common';
import { IncidentsService } from './incidents.service';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  Role,
  IncidentResponse,
} from '@prisma/client';

@Controller('incidents')
@UseGuards(JwtGuard, RolesGuard)
export class IncidentsController {
  constructor(
    private readonly incidentsService: IncidentsService,
  ) {}

  /* ===============================
     LISTAR INCIDENCIAS
  =============================== */
  @Get()
  @Roles(
    Role.ADMIN_EMPRESA,
    Role.ADMIN_SUCURSAL,
    Role.SUPERADMIN,
  )
  findAll(
    @Req() req: any,
    @Query('branchId') branchId?: string,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.incidentsService.findAll({
      companyId: req.user.companyId,
      branchId,
      userId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }

  /* ===============================
     ➕ AÑADIR NOTA (ADMIN)
  =============================== */
  @Post('note')
  @Roles(
    Role.ADMIN_EMPRESA,
    Role.ADMIN_SUCURSAL,
    Role.SUPERADMIN,
  )
  addNote(
    @Req() req: any,
    @Body()
    body: {
      userId: string;
      membershipId: string;
      branchId: string;
      note: string;
    },
  ) {
    return this.incidentsService.addAdminNote({
      admin: req.user,
      companyId: req.user.companyId,
      userId: body.userId,
      membershipId: body.membershipId,
      branchId: body.branchId,
      note: body.note,
    });
  }

  /* ===============================
     RESPONDER INCIDENCIA
     - Empleado o Admin
     - SÍ / NO / ADMITIR / DENEGAR
  =============================== */
  @Post(':id/respond')
  respondIncident(
    @Req() req: any,
    @Param('id') incidentId: string,
    @Body()
    body: {
      response: IncidentResponse; // ADMITTED | DENIED
    },
  ) {
    
  }
}