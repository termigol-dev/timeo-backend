import { SetMetadata } from '@nestjs/common';

export const Plan = (plan: string) => SetMetadata('plan', plan);