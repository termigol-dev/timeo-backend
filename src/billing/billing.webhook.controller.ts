import { Controller, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';

const Stripe = require('stripe');

@Controller('billing')
export class BillingWebhookController {

    private stripe = new Stripe(
        process.env.STRIPE_SECRET_KEY
    );

    constructor(
        private prisma: PrismaService
    ) { }

    @Post('webhook')
    async handleWebhook(
        @Req() req: Request,
        @Res() res: Response
    ) {

        const sig =
            req.headers['stripe-signature'];

        let event;

        try {

            console.log(
                '🔑 WEBHOOK SECRET 👉',
                process.env.STRIPE_WEBHOOK_SECRET
            );

            console.log(
                '🧾 SIGNATURE HEADER 👉',
                sig
            );

            event =
                this.stripe.webhooks.constructEvent(
                    req.body,
                    sig,
                    process.env.STRIPE_WEBHOOK_SECRET
                );

        } catch (err) {

            console.error(
                '❌ Error webhook:',
                err.message
            );

            return res
                .status(400)
                .send(
                    `Webhook Error: ${err.message}`
                );
        }

        /*
        |--------------------------------------------------------------------------
        | CHECKOUT COMPLETED
        |--------------------------------------------------------------------------
        */

        if (
            event.type ===
            'checkout.session.completed'
        ) {

            const session =
                event.data.object;

            const companyId =
                session.metadata?.companyId;

            const plan =
                session.metadata?.plan;

            const billingPeriod =
                session.metadata?.billingPeriod;

            console.log(
                '💰 PAGO COMPLETADO PARA:',
                companyId,
                plan
            );

            console.log(
                '🧾 SESSION CUSTOMER 👉',
                session.customer
            );

            console.log(
                '🧾 SESSION SUBSCRIPTION 👉',
                session.subscription
            );

            if (companyId && plan) {

                await this.prisma.company.update({

                    where: {
                        id: companyId,
                    },

                    data: {

                        plan,

                        active: true,

                        subscriptionStatus:
                            'ACTIVE',

                        trialEnd: null,

                        stripeCustomerId:
                            session.customer,

                        stripeSubscriptionId:
                            session.subscription,

                        billingPeriod,

                        subscriptionRenewalDate:
                            new Date(),
                    },
                });

                console.log(
                    '✅ EMPRESA ACTUALIZADA A:',
                    plan
                );

            } else {

                console.log(
                    '⚠️ Falta metadata en la sesión'
                );
            }
        }

        return res.json({
            received: true,
        });
    }
}