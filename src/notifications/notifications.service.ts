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

    console.log('📨 SEND PUSH TO USER:', userId);
    console.log('📦 PAYLOAD:', payload);

    const devices = await this.devicesService.getDevicesByUser(userId);

    console.log('📱 DEVICES FOUND:', devices.length);

    for (const device of devices) {

      try {

        // 🔥 ignorar tokens antiguos (UUID)
        if (!device.token.startsWith('{')) {
          console.log('⚠️ SKIPPING OLD DEVICE TOKEN', device.token);
          continue;
        }

        let subscription;

        try {
          subscription = JSON.parse(device.token);
        } catch (e) {
          console.log('❌ INVALID JSON TOKEN', device.token);
          continue;
        }

        console.log('🚀 SENDING TO:', subscription.endpoint?.slice(0, 50));

        await webPush.sendNotification(
          subscription,
          JSON.stringify(payload) // 🔥 USAMOS EL PAYLOAD REAL
        );

        console.log('✅ PUSH SENT');

      } catch (error: any) {

        console.log('❌ PUSH ERROR:', error?.statusCode);

        // 🔥 limpiar dispositivos muertos
        if (error?.statusCode === 410 || error?.statusCode === 404) {
          console.log('🧹 REMOVING INVALID DEVICE', device.id);
          await this.devicesService.deleteDevice(device.id);
        }
      }
    }
  }

  // 👉 helper para usar luego fácil
  async notify(userId: string, title: string, body: string) {
    return this.sendToUser(userId, { title, body });
  }
}