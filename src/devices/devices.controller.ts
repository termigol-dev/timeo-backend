import { Body, Controller, Post, Req, Get, Param } from '@nestjs/common';
import { DevicesService } from './devices.service';

@Controller('devices')
export class DevicesController {
  constructor(private devicesService: DevicesService) {}

  @Post('register')
  async registerDevice(
    @Body() body: { token: string; platform: 'WEB' | 'ANDROID' | 'IOS' },
    @Req() req: any,
  ) {

    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw new Error('Missing Authorization header');
    }

    const jwt = authHeader.split(' ')[1];

    const payload = JSON.parse(
      Buffer.from(jwt.split('.')[1], 'base64').toString()
    );

    const userId = payload.sub;

    console.log('REGISTER DEVICE', {
      userId,
      token: body.token,
      platform: body.platform
    });

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