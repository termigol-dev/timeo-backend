import { Controller, Get, Param } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {

  constructor(private notificationsService: NotificationsService) {}

  @Get('test/:userId')
  async testPush(@Param('userId') userId: string) {

    await this.notificationsService.sendToUser(userId, {
      title: 'TIMEO',
      body: 'Esto es una notificación real 👊',
    });

    return { ok: true };
  }
}