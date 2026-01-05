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
     👉 IN / OUT + último registro
  ====================================================== */
  @Get('status')
  getStatus(@Req() req: any) {
    return this.mobileService.getStatus({
      userId: req.user.id,
      companyId: req.user.companyId,
    });
  }

  /* ======================================================
     CHECK-IN (IN)
  ====================================================== */
  @Post('in')
  checkIn(@Req() req: any) {
    return this.mobileService.recordIn({
      userId: req.user.id,
      companyId: req.user.companyId,
    });
  }

  /* ======================================================
     CHECK-OUT (OUT)
  ====================================================== */
  @Post('out')
  checkOut(@Req() req: any) {
    return this.mobileService.recordOut({
      userId: req.user.id,
      companyId: req.user.companyId,
    });
  }

  /* ======================================================
     📌 INCIDENCIAS PENDIENTES DEL EMPLEADO
     👉 olvidos / llegadas tarde / salidas tarde
  ====================================================== */
  @Get('incidents/pending')
  getPendingIncidents(@Req() req: any) {
    return this.mobileService.getPendingIncidents({
      userId: req.user.id,
      companyId: req.user.companyId,
    });
  }

  /* ======================================================
     CONFIRMAR INCIDENCIA (OLVIDO / TARDE)
     👉 el empleado admite o no
  ====================================================== */
  @Post('confirm-forgot')
  confirmForgot(
    @Req() req: any,
    @Body()
    body: {
      incidentId: string;
      admitted: boolean;
    },
  ) {
    return this.mobileService.confirmForgot({
      incidentId: body.incidentId,
      admitted: body.admitted,
      userId: req.user.id,
    });
  }
}