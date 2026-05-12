import { Controller, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';

const Stripe = require('stripe');

@Controller('billing')
export class BillingWebhookController {

    private stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    constructor(private prisma: PrismaService) { }

    @Post('webhook')
    async handleWebhook(@Req() req: Request, @Res() res: Response) {

        const sig = req.headers['stripe-signature'];

        let event;

        try {
            event = this.stripe.webhooks.constructEvent(
                req.body,
                sig,
                process.env.STRIPE_WEBHOOK_SECRET
            );
        } catch (err) {
            console.error('❌ Error webhook:', err.message);
            return res.status(400).send(`Webhook Error: ${err.message}`);
        }

        // 🎯 PAGO COMPLETADO
        if (event.type === 'checkout.session.completed') {

            const session = event.data.object;

            const companyId = session.metadata?.companyId;
            const plan = session.metadata?.plan;

            console.log('💰 PAGO COMPLETADO PARA:', companyId, plan);

            await this.prisma.company.update({
                where: { id: companyId },
                data: {
                    plan: plan,
                    active: true,
                },
            });

            console.log('✅ EMPRESA ACTUALIZADA A:', plan);

            // 🔥 ACTUALIZAR EMPRESA
            if (companyId && plan) {
                await this.prisma.company.update({
                    where: { id: companyId },
                    data: {
                        plan: plan,
                        subscriptionStatus: 'ACTIVE',
                        trialEnd: null,
                    },
                });

                console.log('✅ EMPRESA ACTUALIZADA A:', plan);
            } else {
                console.log('⚠️ Falta metadata en la sesión');
            }
        }

        return res.json({ received: true });
    }
}