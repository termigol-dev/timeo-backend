import { Injectable } from '@nestjs/common';
import * as webPush from 'web-push';
import { DevicesService } from '../devices/devices.service';

@Injectable()
export class NotificationsService {

  constructor(
    private devicesService: DevicesService
  ) {

    webPush.setVapidDetails(
      process.env.VAPID_EMAIL!,
      process.env.VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    );
  }

  async sendToUser(userId: string, payload: any) {

    const devices = await this.devicesService.getDevicesByUser(userId);

    for (const device of devices) {

      try {

        await webPush.sendNotification(
          JSON.parse(device.token),
          JSON.stringify(payload)
        );

      } catch (error) {

        console.log('Push error', error);

      }

    }
  }
}