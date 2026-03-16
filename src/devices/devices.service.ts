import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DevicesService {
  constructor(private prisma: PrismaService) { }

  async registerDevice(userId: string, token: string, platform: 'WEB' | 'ANDROID' | 'IOS') {
    return this.prisma.device.upsert({
      where: { token },
      update: {
        userId,
        platform,
      },
      create: {
        userId,
        token,
        platform,
      },
    });
  }
  async getDevicesByUser(userId: string) {
    return this.prisma.device.findMany({
      where: { userId },
      select: {
        id: true,
        platform: true,
        token: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }
  
}