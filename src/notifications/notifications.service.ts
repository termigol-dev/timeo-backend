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

        // ignorar tokens antiguos (UUID)
        if (!device.token.startsWith('{')) {

          console.log('SKIPPING OLD DEVICE TOKEN', device.token);
          continue;

        }

        const subscription = JSON.parse(device.token);

        await webPush.sendNotification(
          JSON.parse(device.token),
          JSON.stringify({
            title: "TIMEO TEST",
            body: "Mensaje real funcionando"
          })
        );

        console.log('PUSH SENT');

      } catch (error: any) {

        console.log('Push error', error?.statusCode);

        // eliminar dispositivos caducados
        if (error?.statusCode === 410 || error?.statusCode === 404) {

          console.log('REMOVING INVALID DEVICE', device.id);

          await this.devicesService.deleteDevice(device.id);

        }

      }

    }

  }

}