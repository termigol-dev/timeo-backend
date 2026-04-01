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

    const parsed = JSON.parse(token);
    const endpoint = parsed.endpoint;

    console.log('REGISTER / UPSERT DEVICE', {
      userId,
      platform,
      endpoint
    });

    return this.prisma.device.upsert({
      where: {
        endpoint: endpoint
      },
      update: {
        userId: userId,
        platform: platform,
        token: token
      },
      create: {
        userId: userId,
        token: token,
        platform: platform,
        endpoint: endpoint
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