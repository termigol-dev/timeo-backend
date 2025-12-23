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
    // 1️⃣ Buscar usuario con memberships activas
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

    // 2️⃣ Validar contraseña
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    // 3️⃣ Debe tener al menos una membership activa
    if (!user.memberships.length) {
      throw new UnauthorizedException(
        'El usuario no tiene membresía activa',
      );
    }

    // 4️⃣ Elegir la membership con mayor rol
    const rolePriority = {
      SUPERADMIN: 4,
      ADMIN_EMPRESA: 3,
      ADMIN_SUCURSAL: 2,
      EMPLEADO: 1,
    };

    const membership = user.memberships.sort(
      (a, b) => rolePriority[b.role] - rolePriority[a.role],
    )[0];

    if (!membership) {
      throw new UnauthorizedException(
        'El usuario no tiene una membresía válida',
      );
    }

    // 5️⃣ Validación de sucursal (CLAVE)
    if (
      membership.role !== Role.SUPERADMIN &&
      membership.role !== Role.ADMIN_EMPRESA &&
      !membership.branchId
    ) {
      throw new UnauthorizedException(
        'El usuario no tiene sucursal asignada',
      );
    }

    // 6️⃣ Payload JWT
    const payload = {
      sub: user.id,
      membershipId: membership.id,
      role: membership.role,
      companyId: membership.companyId,
      branchId: membership.branchId ?? null,
    };

    const token = this.jwt.sign(payload);

    // 7️⃣ Respuesta al frontend
    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: membership.role,
        companyId: membership.companyId,
        branchId: membership.branchId ?? null,
      },
    };
  }
}