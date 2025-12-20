import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { TabletService } from './tablet.service';
import { TabletGuard } from './guards/tablet.guard';

@Controller('tablet')
@UseGuards(TabletGuard)
export class TabletController {
  constructor(private readonly tabletService: TabletService) {}

  @Get('employees')
  getEmployees(@Req() req: any) {
    return this.tabletService.getEmployees(req.branch.id);
  }

  @Post('in/:userId')
  recordIn(@Req() req: any, @Param('userId') userId: string) {
    return this.tabletService.recordIn(
      userId,
      req.branch.id,
      req.company.id,
    );
  }

  @Post('out/:userId')
  recordOut(@Req() req: any, @Param('userId') userId: string) {
    return this.tabletService.recordOut(
      userId,
      req.branch.id,
      req.company.id,
    );
  }
}
