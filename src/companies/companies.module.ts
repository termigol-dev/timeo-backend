import { Module } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { CompaniesController } from './companies.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtModule } from '@nestjs/jwt';
@Module({
  imports: [PrismaModule,JwtModule.register({})],
  controllers: [CompaniesController],
  providers: [CompaniesService],
})
export class CompaniesModule {}
