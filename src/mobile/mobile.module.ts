import { Module } from '@nestjs/common';
import { MobileController } from './mobile.controller';
import { MobileService } from './mobile.service';
import { PrismaModule } from '../prisma/prisma.module';
import { IncidentsModule } from '../incidents/incidents.module';

@Module({
  imports: [
    PrismaModule,      // 👈 PrismaService viene de aquí
    IncidentsModule,   // 👈 IncidentsService viene de aquí
  ],
  controllers: [MobileController],
  providers: [MobileService],
})
export class MobileModule {}