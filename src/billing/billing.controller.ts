import { Controller, Post, Req, Body } from '@nestjs/common';
import { BillingService } from './billing.service';

@Controller('billing')
export class BillingController {

  constructor(
    private readonly billingService: BillingService
  ) {}

  @Post('checkout')
  async checkout(@Req() req, @Body() body) {

    // 🔥 FALLBACK TEMPORAL
    const user = req.user || {
      id: 'test-user',
      email: 'test@test.com',
      companyId: '0cefd24d-a69f-4e16-b6c7-9092aa2d5bbb',
    };

    console.log('USER 👉', user);

    console.log('BODY 👉', body);

    return this.billingService.createCheckoutSession(
      user,
      body.plan,
      body.billingPeriod,
      body.withSetup,
    );
  }
}