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
  constructor(private readonly schedulesService: SchedulesService) {}

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
    @Body()
    body: {
      weekday: number;
      startTime: string;
      endTime: string;
    },
  ) {
    return this.schedulesService.addShiftToSchedule(
      scheduleId,
      body,
    );
  }

  /* ======================================================
     ELIMINAR TURNO
  ====================================================== */
  @Delete('shifts/:shiftId')
  @Roles(
    Role.SUPERADMIN,
    Role.ADMIN_EMPRESA,
    Role.ADMIN_SUCURSAL,
  )
  removeShift(@Param('shiftId') shiftId: string) {
    return this.schedulesService.removeShift(shiftId);
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
  
@Post(':scheduleId/vacations')
@Roles(Role.SUPERADMIN, Role.ADMIN_EMPRESA, Role.ADMIN_SUCURSAL)
async addVacation(
  @Req() req,
  @Param('scheduleId') scheduleId: string,
  @Body() body,
) {
  try {
    console.log('🟠 CONTROLLER addVacation', {
      scheduleId,
      body,
      user: req.user?.id,
    });

    return await this.schedulesService.addVacation(
      req.user,
      scheduleId,
      body,
    );
  } catch (error) {
    console.error(
      '🔥 CONTROLLER addVacation ERROR',
      error?.message,
      error?.stack,
    );
    throw error;
  }
}
}