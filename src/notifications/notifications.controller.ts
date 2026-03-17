import { Body, Controller, Post, Get, Param } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  // 🔹 TEST (URL directa)
  @Get('test/:userId')
  async testPush(@Param('userId') userId: string) {
    console.log('🧪 TEST PUSH:', userId);

    await this.notificationsService.sendToUser(userId, {
      title: 'TIMEO',
      body: 'Esto es una notificación real 👊',
    });

    return { ok: true };
  }

  // 🔹 ADMIN (POST)
  @Post('send')
  async sendToUser(
    @Body() body: {
      userId: string;
      title: string;
      body: string;
    },
  ) {
    console.log('📨 ADMIN PUSH:', body);

    await this.notificationsService.sendToUser(body.userId, {
      title: body.title,
      body: body.body,
    });

    return { ok: true };
  }
}