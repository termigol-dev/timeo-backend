import { Module } from '@nestjs/common';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';
import { PrismaService } from '../prisma/prisma.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  controllers: [DevicesController],
  providers: [DevicesService, PrismaService],
  imports: [PrismaModule],
  exports: [DevicesService],   //
})
export class DevicesModule {}