import { Module } from '@nestjs/common';
import { RecordsService } from './records.service';
import { RecordsController } from './records.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { IncidentsModule } from '../incidents/incidents.module';
import { PunchService } from './punch.service';
import { Punch2Service } from './punchv2.service';
import { SimulateController } from './simulate.controller';
import { CronService } from './cron.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, IncidentsModule, NotificationsModule],
  controllers: [RecordsController, SimulateController],
  providers: [
    RecordsService,
    PunchService,
    {
      provide: 'PUNCH_V2',       // 👈 TOKEN NUEVO
      useClass: Punch2Service,  // 👈 PUNCH2 CONTROLADO
    },
    CronService,
  ],
  exports: [
    PunchService,
    'PUNCH_V2',                 // 👈 EXPORTAMOS EL TOKEN
  ],
})
export class RecordsModule {}