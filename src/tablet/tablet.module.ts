import { Module } from '@nestjs/common';
import { TabletController } from './tablet.controller';
import { TabletService } from './tablet.service';
import { PrismaModule } from '../prisma/prisma.module';
import { RecordsModule } from '../records/records.module';

@Module({
  imports: [PrismaModule, RecordsModule],
  controllers: [TabletController],
  providers: [TabletService],
})
export class TabletModule {}
