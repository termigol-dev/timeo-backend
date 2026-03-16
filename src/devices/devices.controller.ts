import { Body, Controller, Post, Req, Get, Param } from '@nestjs/common';
import { DevicesService } from './devices.service';

@Controller('devices')
export class DevicesController {
  constructor(private devicesService: DevicesService) { }

  @Post('register')
  async registerDevice(
    @Body() body: { token: string; platform: 'WEB' | 'ANDROID' | 'IOS' },
    @Req() req: any,
  ) {
    const userId = req.user.id;

    return this.devicesService.registerDevice(
      userId,
      body.token,
      body.platform,
    );
  }

  @Get('user/:userId')
  async getDevicesByUser(@Param('userId') userId: string) {
    return this.devicesService.getDevicesByUser(userId);
  }
}