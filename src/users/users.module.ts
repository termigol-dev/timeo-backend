import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersService } from './users.service';

import {
  UsersController,
  UsersGlobalController,
  GlobalUsersController,
} from './users.controller';

@Module({
  imports: [PrismaModule],
  controllers: [
    UsersController,
    UsersGlobalController,
    GlobalUsersController,
  ],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}