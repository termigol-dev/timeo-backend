import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async login(email: string, password: string) {
    // 1️⃣ Buscar usuario + memberships
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        memberships: {
          where: { active: true },
        },
      },
    });

    if (!user || !user.active) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    // 2️⃣ Validar password
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    // 3️⃣ Obtener membership activa
    const membership = user.memberships[0];

    if (!membership) {
      throw new UnauthorizedException('El usuario no tiene membresía activa');
    }

    // 4️⃣ Payload JWT
    const payload = {
      sub: user.id,
      membershipId: membership.id,
      role: membership.role,
      companyId: membership.companyId,
      branchId: membership.branchId,
    };

    // 5️⃣ Respuesta
    return {
      token: this.jwt.sign(payload),
      user: {
        id: user.id,
        role: membership.role,
        companyId: membership.companyId,
        branchId: membership.branchId,
      },
    };
  }
}