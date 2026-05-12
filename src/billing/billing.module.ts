import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { BillingWebhookController } from './billing.webhook.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
    imports: [PrismaModule], // 👈 ESTO ES LA CLAVE
    controllers: [BillingController, BillingWebhookController],
    providers: [BillingService],
})
export class BillingModule { }