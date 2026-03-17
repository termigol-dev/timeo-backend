import { Module } from '@nestjs/common';
import { RecordsService } from './records.service';
import { RecordsController } from './records.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { IncidentsModule } from '../incidents/incidents.module';
import { PunchService } from './punch.service';
import { SimulateController } from './simulate.controller';
import { SimulateService } from './simulate.service';
import { CronService } from './cron.service';

@Module({
  imports: [PrismaModule,IncidentsModule],
  controllers: [RecordsController,SimulateController],
  providers: [RecordsService,PunchService,SimulateService,CronService],
  exports: [PunchService],   // 👈 ESTO ES LO IMPORTANTE
})
export class RecordsModule {}
