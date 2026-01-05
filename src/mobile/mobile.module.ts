import { Module } from '@nestjs/common';
import { MobileController } from './mobile.controller';
import { MobileService } from './mobile.service';
import { PrismaService } from '../prisma/prisma.service';
import { IncidentsService } from '../incidents/incidents.service';

@Module({
  controllers: [MobileController],
  providers: [
    MobileService,
    PrismaService,
    IncidentsService, // 👈 para crear/confirmar incidencias
  ],
})
export class MobileModule {}