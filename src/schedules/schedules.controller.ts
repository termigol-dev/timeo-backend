import {
  Controller,
  Post,
  Delete,
  Get,
  Body,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SchedulesService } from './schedules.service';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('companies/:companyId/branches/:branchId/schedules')
@UseGuards(JwtGuard, RolesGuard)
export class SchedulesController {
  constructor(private readonly schedulesService: SchedulesService) { }

  /* ======================================================
     CREAR HORARIO (BORRADOR)
  ====================================================== */
  @Post('draft/:userId')
  @Roles(
    Role.SUPERADMIN,
    Role.ADMIN_EMPRESA,
    Role.ADMIN_SUCURSAL,
  )
  createDraft(
    @Param('companyId') companyId: string,
    @Param('branchId') branchId: string,
    @Param('userId') userId: string,
    @Req() req: any,
  ) {
    return this.schedulesService.createDraftSchedule(
      companyId,
      branchId,
      userId,
      req.user,
    );
  }

  /* ======================================================
     AÑADIR TURNO
  ====================================================== */
  @Post(':scheduleId/shifts')
  @Roles(
    Role.SUPERADMIN,
    Role.ADMIN_EMPRESA,
    Role.ADMIN_SUCURSAL,
  )
  addShift(
    @Param('scheduleId') scheduleId: string,
    @Body() body,
  ) {
    console.log('🟡 ADD SHIFT CONTROLLER:', {
      scheduleId,
      body,
    });

    return this.schedulesService.addShiftToSchedule(
      scheduleId,
      body,
    );
  }

  /* ======================================================
     🆕 ELIMINAR TURNOS (PANEL SUPERIOR)
  ====================================================== */
  @Delete(':scheduleId/shifts')
  @Roles(
    Role.SUPERADMIN,
    Role.ADMIN_EMPRESA,
    Role.ADMIN_SUCURSAL,
  )
  deleteShifts(
    @Param('scheduleId') scheduleId: string,
    @Body()
    body: {
      source: 'PANEL' | 'CALENDAR';
      mode: 'ONLY_THIS_BLOCK' | 'FROM_THIS_DAY_ON' | 'RANGE';
      dateFrom?: string;
      dateTo?: string;
      startTime?: string;
      endTime?: string;
      shiftId?: string;
    },
  ) {
    return this.schedulesService.deleteShifts(
      scheduleId,
      body,
    );
  }
  /* ======================================================
     CALCULAR HORAS SEMANALES (PREVIEW)
  ====================================================== */
  @Get(':scheduleId/weekly-hours')
  @Roles(
    Role.SUPERADMIN,
    Role.ADMIN_EMPRESA,
    Role.ADMIN_SUCURSAL,
  )
  getWeeklyHours(@Param('scheduleId') scheduleId: string) {
    return this.schedulesService.calculateWeeklyHours(
      scheduleId,
    );
  }

  /* ======================================================
   CONFIRMAR HORARIO
====================================================== */
@Post(':scheduleId/confirm')
@Roles(
  Role.SUPERADMIN,
  Role.ADMIN_EMPRESA,
  Role.ADMIN_SUCURSAL,
)
confirm(@Param('scheduleId') scheduleId: string) {
  return this.schedulesService.confirmSchedule(scheduleId);
}

  /* ======================================================
     VER HORARIO ACTIVO (EMPLEADO / ADMIN)
  ====================================================== */
  @Get('user/:userId/active')
  @Roles(
    Role.SUPERADMIN,
    Role.ADMIN_EMPRESA,
    Role.ADMIN_SUCURSAL,
    Role.EMPLEADO,
  )
  getActiveSchedule(@Param('userId') userId: string) {
    return this.schedulesService.getActiveSchedule(userId);
  }

  /* ======================================================
     AÑADIR VACACIONES
  ====================================================== */
  @Post(':scheduleId/vacations')
  @Roles(
    Role.SUPERADMIN,
    Role.ADMIN_EMPRESA,
    Role.ADMIN_SUCURSAL,
  )
  addVacation(
    @Req() req,
    @Param('scheduleId') scheduleId: string,
    @Body() body,
  ) {
    return this.schedulesService.addVacation(
      req.user,
      scheduleId,
      body,
    );
  }

  /* ======================================================
   ELIMINAR VACACIONES
====================================================== */
  @Delete(':scheduleId/vacations')
  @Roles(
    Role.SUPERADMIN,
    Role.ADMIN_EMPRESA,
    Role.ADMIN_SUCURSAL,
  )
  deleteVacation(
    @Param('scheduleId') scheduleId: string,
    @Body()
    body: {
      date: string;
      mode: 'single' | 'forward';
    },
  ) {
    return this.schedulesService.deleteVacation(
      scheduleId,
      body.date,
      body.mode,
    );
  }
}
