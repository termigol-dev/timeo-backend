import { Module } from '@nestjs/common';
import { RecordsService } from './records.service';
import { RecordsController } from './records.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { IncidentsModule } from '../incidents/incidents.module';
import { PunchService } from './punch.service';

@Module({
  imports: [PrismaModule,IncidentsModule],
  controllers: [RecordsController],
  providers: [RecordsService,  PunchService],
  exports: [RecordsService],   // 👈 ESTO ES LO IMPORTANTE
})
export class RecordsModule {}
