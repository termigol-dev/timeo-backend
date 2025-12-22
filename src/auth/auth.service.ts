import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async login(email: string, password: string) {
    // 1️⃣ Buscar usuario con membresías activas
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

    // 3️⃣ Obtener membresía activa (CLAVE)
    if (!user.memberships.length) {
  throw new UnauthorizedException('El usuario no tiene membresía activa');
}

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
        'El usuario no tiene una membresía activa',
      );
    }

    // 4️⃣ Payload JWT (lo que viaja en el token)
    const payload = {
      sub: user.id,
      membershipId: membership.id,
      role: membership.role,
      companyId: membership.companyId,
      branchId: membership.branchId,
    };

    const token = this.jwt.sign(payload);

    // 5️⃣ Respuesta AL FRONTEND (🔥 MUY IMPORTANTE 🔥)
    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,

        // 👇 ESTO ES LO QUE EL FRONT USA PARA PERMISOS
        role: membership.role,
        companyId: membership.companyId,
        branchId: membership.branchId,
      },
    };
  }
}