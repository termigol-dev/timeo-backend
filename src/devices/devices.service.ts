import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DevicesService {

  constructor(private prisma: PrismaService) {}

  async registerDevice(
    userId: string,
    token: string,
    platform: 'WEB' | 'ANDROID' | 'IOS',
  ) {

    console.log('REGISTER / UPSERT DEVICE', {
      userId,
      platform,
      tokenPreview: token?.substring(0, 40)
    });

    return this.prisma.device.upsert({
      where: {
        token: token
      },
      update: {
        userId: userId,
        platform: platform
      },
      create: {
        userId: userId,
        token: token,
        platform: platform
      }
    });

  }

  async getDevicesByUser(userId: string) {

    const devices = await this.prisma.device.findMany({
      where: { userId },
      select: {
        id: true,
        platform: true,
        token: true,
        createdAt: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    console.log('DEVICES FOUND', devices.length);

    return devices;
  }

  async deleteDevice(deviceId: string) {

    return this.prisma.device.delete({
      where: { id: deviceId }
    });

  }

}