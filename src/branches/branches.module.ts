import { Module } from '@nestjs/common';
import { BranchesService } from './branches.service';
import { BranchesController } from './branches.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { PublicController } from './public.controller';

@Module({
  imports: [PrismaModule],
  controllers: [BranchesController, PublicController],
  providers: [BranchesService],
  exports: [BranchesService],
})
export class BranchesModule {}
