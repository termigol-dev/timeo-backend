import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async login(email: string, password: string) {
    // 1️⃣ Usuario + TODAS las memberships
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        memberships: true,
      },
    });

    if (!user || !user.active) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    // 2️⃣ Password
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    // 3️⃣ Si NO tiene ninguna membership
    // 👉 solo bloquea si NO es superadmin
    if (!user.memberships.length) {
      throw new UnauthorizedException(
        'El usuario no tiene ningún rol asignado',
      );
    }

    // 4️⃣ Prioridad de roles
    const rolePriority: Record<Role, number> = {
      SUPERADMIN: 4,
      ADMIN_EMPRESA: 3,
      ADMIN_SUCURSAL: 2,
      EMPLEADO: 1,
    };

    // 5️⃣ Elegir la membership de mayor nivel
    const membership = user.memberships.sort(
      (a, b) => rolePriority[b.role] - rolePriority[a.role],
    )[0];

    // 6️⃣ VALIDACIONES SOLO PARA EMPLEADO
    if (membership.role === Role.EMPLEADO) {
      if (!membership.active) {
        throw new UnauthorizedException(
          'El empleado no tiene membresía activa',
        );
      }

      if (!membership.branchId) {
        throw new UnauthorizedException(
          'El empleado no tiene sucursal asignada',
        );
      }
    }

    // 7️⃣ JWT
    const payload = {
      sub: user.id,
      membershipId: membership.id,
      role: membership.role,
      companyId: membership.companyId ?? null,
      branchId: membership.branchId ?? null,
    };

    const token = this.jwt.sign(payload);

    // 8️⃣ Respuesta frontend
    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: membership.role,
        companyId: membership.companyId ?? null,
        branchId: membership.branchId ?? null,
      },
    };
  }
}