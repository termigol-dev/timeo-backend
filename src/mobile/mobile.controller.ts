import {
  Controller,
  Get,
  Post,
  Req,
  Body,
  UseGuards,
} from '@nestjs/common';
import { MobileService } from './mobile.service';
import { JwtGuard } from '../auth/guards/jwt.guard';

@Controller('mobile')
@UseGuards(JwtGuard)
export class MobileController {
  constructor(
    private readonly mobileService: MobileService,
  ) {}

  /* ======================================================
     ESTADO ACTUAL DEL EMPLEADO
  ====================================================== */
  @Get('status')
  getStatus(@Req() req: any) {
    return this.mobileService.getStatus({
      userId: req.user.id,
      companyId: req.user.companyId,
    });
  }

  /* ======================================================
     CHECK-IN
  ====================================================== */
  @Post('in')
  checkIn(@Req() req: any) {
    return this.mobileService.recordIn({
      userId: req.user.id,
      companyId: req.user.companyId,
    });
  }

  /* ======================================================
     CHECK-OUT
  ====================================================== */
  @Post('out')
  checkOut(@Req() req: any) {
    return this.mobileService.recordOut({
      userId: req.user.id,
      companyId: req.user.companyId,
    });
  }

  /* ======================================================
     CONFIRMACIÓN CASO "NO HAY HORARIO"
     admitted = true  → todo OK
     admitted = false → WRONG_IN + OUT automático
  ====================================================== */
  @Post('confirm-incident')
  confirmIncident(
    @Req() req: any,
    @Body() body: { admitted: boolean },
  ) {
    return this.mobileService.confirmForgot({
      admitted: body.admitted,
      userId: req.user.id,
    });
  }

  @Get('schedule')
getMySchedule(@Req() req: any) {
  return this.mobileService.getMySchedule({
    userId: req.user.id,
    companyId: req.user.companyId,
  });
}

}