import {
  Controller,
  Post,
  Req,
  Body,
  UseGuards,
} from '@nestjs/common';

import { BillingService } from './billing.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtGuard } from '../auth/guards/jwt.guard';

@Controller('billing')
export class BillingController {

  constructor(
    private readonly billingService: BillingService,
    private readonly prisma: PrismaService,
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

  @UseGuards(JwtGuard)
  @Post('portal')
  async portal(@Req() req) {

    const company =
      await this.prisma.company.findUnique({
        where: {
          id: req.user.companyId,
        },
      });

    if (!company?.stripeCustomerId) {
      throw new Error(
        'La empresa no tiene cliente Stripe'
      );
    }

    return this.billingService.createPortalSession(
      company.stripeCustomerId
    );
  }
}