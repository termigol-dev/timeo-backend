import { Module } from '@nestjs/common';
import { SimulateController } from './simulate.controller';
import { Punch2Service } from './punchv2.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SimulateController],
  providers: [Punch2Service],
})
export class SimulateModule {}