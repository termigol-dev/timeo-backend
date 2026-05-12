import { Injectable } from '@nestjs/common';

const Stripe = require('stripe');

@Injectable()
export class BillingService {

  private stripe;

  constructor() {

    console.log(
      'STRIPE KEY 👉',
      process.env.STRIPE_SECRET_KEY
    );

    this.stripe = new Stripe(
      process.env.STRIPE_SECRET_KEY
    );
  }

  async createCheckoutSession(
    user: any,
    plan: string,
    billingPeriod: string,
    withSetup: boolean,
  ) {

    let priceId = '';

    /*
    |--------------------------------------------------------------------------
    | BASIC
    |--------------------------------------------------------------------------
    */

    if (plan === 'BASIC') {

      if (
        billingPeriod === 'MONTHLY' &&
        !withSetup
      ) {
        priceId =
          'price_1TUaf7LjZXlYoJg9xOOIx8tX';
      }

      if (
        billingPeriod === 'YEARLY' &&
        !withSetup
      ) {
        priceId =
          'price_1TWOmkLjZXlYoJg9kWTRaIps';
      }

      if (
        billingPeriod === 'MONTHLY' &&
        withSetup
      ) {
        priceId =
          'price_1TWOjFLjZXlYoJg9XM4cLfRT';
      }

      /*
      |--------------------------------------------------------------------------
      | BASIC + SETUP YEARLY
      |--------------------------------------------------------------------------
      */

      if (
        billingPeriod === 'YEARLY' &&
        withSetup
      ) {
        // ⚠️ PON AQUÍ EL ID REAL
        priceId =
          'price_1TWOnOLjZXlYoJg9AdHHFfO1';
      }
    }

    /*
    |--------------------------------------------------------------------------
    | PRO
    |--------------------------------------------------------------------------
    */

    if (plan === 'PRO') {

      if (
        billingPeriod === 'MONTHLY' &&
        !withSetup
      ) {
        priceId =
          'price_1TUahULjZXlYoJg9oudqUNdZ';
      }

      if (
        billingPeriod === 'YEARLY' &&
        !withSetup
      ) {
        priceId =
          'price_1TWOo6LjZXlYoJg9mILoXsj7';
      }

      if (
        billingPeriod === 'MONTHLY' &&
        withSetup
      ) {
        priceId =
          'price_1TWOkDLjZXlYoJg9aCW1Mauu';
      }

      if (
        billingPeriod === 'YEARLY' &&
        withSetup
      ) {
        priceId =
          'price_1TWOoWLjZXlYoJg94jQtyTE0';
      }
    }

    /*
    |--------------------------------------------------------------------------
    | BUSINESS
    |--------------------------------------------------------------------------
    */

    if (plan === 'BUSINESS') {

      if (
        billingPeriod === 'MONTHLY' &&
        !withSetup
      ) {
        priceId =
          'price_1TUahULjZXlYoJg9tgoBy9be';
      }

      if (
        billingPeriod === 'YEARLY' &&
        !withSetup
      ) {
        priceId =
          'price_1TWOovLjZXlYoJg9wswITs3Z';
      }

      if (
        billingPeriod === 'MONTHLY' &&
        withSetup
      ) {
        priceId =
          'price_1TWOloLjZXlYoJg97l7JY5hj';
      }

      if (
        billingPeriod === 'YEARLY' &&
        withSetup
      ) {
        priceId =
          'price_1TWOpOLjZXlYoJg9z93HkhAb';
      }
    }

    if (!priceId) {

      throw new Error(
        'Price ID no encontrado'
      );
    }

    try {

      const session =
        await this.stripe.checkout.sessions.create({

          mode: 'subscription',

          payment_method_types: ['card'],

          customer_email:
            user?.email || 'test@test.com',

          metadata: {
            userId: user?.id,

            companyId:
              user?.companyId ||
              user?.company?.id,

            plan,

            billingPeriod,

            withSetup:
              withSetup.toString(),
          },

          line_items: [
            {
              price: priceId,
              quantity: 1,
            },
          ],

          success_url:
            'http://localhost:5173/success',

          cancel_url:
            'http://localhost:5173/cancel',
        });

      return {
        url: session.url,
      };

    } catch (error) {

      console.error(
        '❌ STRIPE ERROR:',
        error
      );

      throw error;
    }
  }
}