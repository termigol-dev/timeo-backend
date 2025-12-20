import { Controller, Post, Get, Req, UseGuards } from '@nestjs/common';
import { RecordsService } from './records.service';
import { JwtGuard } from '../auth/guards/jwt.guard';

@Controller('records')
@UseGuards(JwtGuard)
export class RecordsController {
  constructor(private readonly recordsService: RecordsService) {}

  @Post('in')
  recordIn(@Req() req: any) {
    const user = req.user;

    return this.recordsService.recordIn(
      user.id,
      user.companyId,
      user.branchId,
    );
  }

  @Post('out')
  recordOut(@Req() req: any) {
    const user = req.user;

    return this.recordsService.recordOut(
      user.id,
      user.companyId,
      user.branchId,
    );
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