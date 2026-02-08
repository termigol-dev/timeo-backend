import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtGuard } from '../auth/guards/jwt.guard';

@Controller('reports')
@UseGuards(JwtGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) { }

  @Get('users/:userId/daily')
  getUserDailyReport(
    @Req() req,
    @Param('userId') userId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {

    if (!userId) {
      throw new BadRequestException('userId requerido');
    }

    if (!from || !to) {
      throw new BadRequestException('from y to son requeridos');
    }

    return this.reportsService.getDailyReportForUser(
      req.user,
      userId,
      from,
      to,
    );
  }
}