import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PlanGuard implements CanActivate {

  constructor(
    private prisma: PrismaService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {

    const requiredPlan = this.reflector.get<string>(
      'plan',
      context.getHandler(),
    );

    if (!requiredPlan) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.companyId) {
      throw new ForbiddenException('Sin empresa');
    }

    const company = await this.prisma.company.findUnique({
      where: { id: user.companyId },
    });

    if (!company) {
      throw new ForbiddenException('Empresa no encontrada');
    }

    const plans = ['BASIC', 'PRO', 'BUSINESS'];

    const currentIndex = plans.indexOf(company.plan);
    const requiredIndex = plans.indexOf(requiredPlan);

    if (currentIndex < requiredIndex) {
      throw new ForbiddenException('Plan insuficiente');
    }

    return true;
  }
}