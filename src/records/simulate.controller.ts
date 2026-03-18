import { Controller, Post, Body, ForbiddenException } from '@nestjs/common';
import { Punch2Service } from './punchv2.service';
import { Inject } from '@nestjs/common';

@Controller('admin/dev')
export class SimulateController {



  constructor(

    private readonly punchService: Punch2Service,
  ) { }

  @Post('simulate')
  async simulate(@Body() body: any) {
    console.log("🚨 CONTROLLER NUEVO");
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Not allowed in production');
    }

    return this.punchService.simulateDay(body);
  }
}