import { Module } from '@nestjs/common';
import { RecordsService } from './records.service';
import { RecordsController } from './records.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { IncidentsModule } from '../incidents/incidents.module';
import { PunchService } from './punch.service';
import { SimulateController } from './simulate.controller';
import { CronService } from './cron.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, IncidentsModule, NotificationsModule],
  controllers: [RecordsController, SimulateController],
  providers: [
    RecordsService,
    PunchService,
    CronService,
  ],
  exports: [
    PunchService,
  ],
})
export class RecordsModule { }