import { Module } from '@nestjs/common';
import { TabletController } from './tablet.controller';
import { TabletService } from './tablet.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [TabletController],
  providers: [TabletService],
})
export class TabletModule {}
