import { Module } from '@nestjs/common';
import { SchedulesService } from './schedules.service';
import { SchedulesController } from './schedules.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [SchedulesController],
  providers: [SchedulesService, PrismaService],
  exports: [SchedulesService],
})
export class SchedulesModule {}