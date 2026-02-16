import { Controller, Post, Body, ForbiddenException } from '@nestjs/common';
import { PunchService } from './punch.service';

@Controller('admin/dev')
export class SimulateController {

  constructor(private readonly punchService: PunchService) {}

  @Post('simulate')
  async simulate(@Body() body: any) {

    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Not allowed in production');
    }

    return this.punchService.simulateDay(body);
  }
}