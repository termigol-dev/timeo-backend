import { Module } from '@nestjs/common';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [DevicesController],
  providers: [DevicesService, PrismaService],
})
export class DevicesModule {}