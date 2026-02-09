import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TabletGuard implements CanActivate {
  constructor(private prisma: PrismaService) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();

    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      throw new UnauthorizedException('Tablet token is required');
    }

    const token = auth.replace('Bearer ', '').trim();
    if (!token) {
      throw new UnauthorizedException('Tablet token is required');
    }

    // ✅ USAMOS findFirst (NO findUnique)
    const branch = await this.prisma.branch.findUnique({
      where: {
        tabletToken: token,
      },
      include: {
        company: true,
      },
    });

    if (!branch || !branch.active || !branch.tabletActive) {
      throw new UnauthorizedException('Invalid tablet token');
    }

    // Contexto disponible para controllers
    req.branch = branch;
    req.company = branch.company;

    return true;
  }
}