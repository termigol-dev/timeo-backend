import { Controller, Post, Param, Get } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {

  constructor(private notificationsService: NotificationsService) {}

  @Get('test/:userId')
  async testPush(@Param('userId') userId: string) {

    await this.notificationsService.sendToUser(userId, {
      title: "Timeo",
      body: "Esto es una notificación de prueba"
    });

    return { ok: true };
  }

}