import {
  Controller,
  Post,
  Req,
  Body,
  UseGuards,
} from '@nestjs/common';

import { BillingService } from './billing.service';

import { JwtGuard } from '../auth/guards/jwt.guard';

@Controller('billing')
export class BillingController {

  constructor(
    private readonly billingService: BillingService
  ) { }

  //@UseGuards(JwtGuard)
  @Post('checkout')
  async checkout(@Req() req, @Body() body) {

    const user = {
      id: 'test',
      email: '888@gmail.com',
      companyId: '4b827210-b4f8-4129-82dc-201995e4c408',
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