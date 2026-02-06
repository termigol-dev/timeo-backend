import {
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtGuard } from '../auth/guards/jwt.guard';

@Controller('reports')
@UseGuards(JwtGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  // 🔹 resumen antiguo
  @Get('me')
  getMyReports(
    @Req() req,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reportsService.getReportsForUser(
      req.user,
      from,
      to,
    );
  }

  // ✅ ESTE ES EL QUE TE FALTA
  @Get('me/daily')
  getMyDailyReport(
    @Req() req,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.reportsService.getDailyReportForUser(
      req.user,
      from,
      to,
    );
  }
}