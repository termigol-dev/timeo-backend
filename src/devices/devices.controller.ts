import { Body, Controller, Post, Req, Get, Param, UseGuards } from '@nestjs/common';
import { DevicesService } from './devices.service';
import { JwtGuard } from '../auth/guards/jwt.guard';

@Controller('devices')
export class DevicesController {

  constructor(private devicesService: DevicesService) {}

  @UseGuards(JwtGuard)
  @Post('register')
  async registerDevice(
    @Body() body: { token: string; platform: 'WEB' | 'ANDROID' | 'IOS' },
    @Req() req: any,
  ) {

    const userId = req.user.id;

    console.log("DEVICE REGISTER REQUEST");
    console.log("USER:", userId);

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