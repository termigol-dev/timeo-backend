import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { DevicesModule } from '../devices/devices.module';
import { NotificationsController } from './notifications.controller';

@Module({
  imports: [DevicesModule],
  providers: [NotificationsService],
  exports: [NotificationsService],
  controllers: [NotificationsController],
})
export class NotificationsModule {}