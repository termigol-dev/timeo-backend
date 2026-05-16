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

  @UseGuards(JwtGuard)
  @Post('checkout')
  async checkout(@Req() req, @Body() body) {

    const user = req.user;

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