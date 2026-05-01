import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersService } from './users.service';
import { MailModule } from '../mail/mail.module';
import {
  UsersController,
  UsersGlobalController,
  GlobalUsersController,
} from './users.controller';

@Module({
  imports: [PrismaModule, MailModule],
  controllers: [
    UsersController,
    UsersGlobalController,
    GlobalUsersController,
  ],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}