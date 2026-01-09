import { Module } from '@nestjs/common';
import { IncidentsService } from './incidents.service';
import { IncidentsController } from './incidents.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { SchedulesModule } from '../schedules/schedules.module';

@Module({
  imports: [
    PrismaModule,
    SchedulesModule,
  ],
  controllers: [IncidentsController],
  providers: [IncidentsService],
  exports: [IncidentsService], // ⬅️ OBLIGATORIO
})
export class IncidentsModule {}