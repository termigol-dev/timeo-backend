import { Controller, Post, Get, Req, UseGuards } from '@nestjs/common';
import { RecordsService } from './records.service';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { PunchService } from './punch.service';
import { RecordType } from '@prisma/client';

@Controller('records')
@UseGuards(JwtGuard)
export class RecordsController {
  constructor(
    private readonly recordsService: RecordsService,
    private readonly punchService: PunchService,
  ) {}

  @Post('in')
  recordIn(@Req() req) {
    return this.punchService.punch({
      userId: req.user.id,
      companyId: req.user.companyId,
      branchId: req.user.branchId,
      type: RecordType.IN,
      createdBy: 'MOBILE',
    });
  }

  @Post('out')
  recordOut(@Req() req) {
    return this.punchService.punch({
      userId: req.user.id,
      companyId: req.user.companyId,
      branchId: req.user.branchId,
      type: RecordType.OUT,
      createdBy: 'MOBILE',
    });
  }

  // 📜 HISTORIAL DEL USUARIO LOGUEADO
  @Get('me')
  getMyHistory(@Req() req) {
    return this.recordsService.getHistory(
      req.user.id,
      req.user.companyId,
    );
  }
}