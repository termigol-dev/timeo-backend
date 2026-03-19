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
    console.log('🔐 LOGIN ATTEMPT', email);

    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { memberships: true },
    });

    console.log('👤 USER FOUND:', !!user);

    if (!user || !user.active) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    const valid = await bcrypt.compare(password, user.password);
    console.log('🔍 PASSWORD VALID:', valid);

    if (!valid) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    // 👉 elegimos la membership de mayor nivel
    const membership = user.memberships
      .sort((a, b) => {
        const priority = {
          SUPERADMIN: 4,
          ADMIN_EMPRESA: 3,
          ADMIN_SUCURSAL: 2,
          EMPLEADO: 1,
        };
        return priority[b.role] - priority[a.role];
      })[0] ?? null;

    const payload = {
      sub: user.id,
      role: membership?.role ?? 'NO_ROLE',
      companyId: membership?.companyId ?? null,
      branchId: membership?.branchId ?? null,
    };

    const token = this.jwt.sign(payload);

    /* ======================================================
       🧠 OBTENER EMPRESA (según tu modelo real)
    ====================================================== */

    let companyName: string | null = null;

    if (membership?.companyId) {
      const company = await this.prisma.company.findUnique({
        where: { id: membership.companyId },
        select: {  commercialName: true },
      });

      companyName = company?.commercialName ?? null;
    }

    /* ======================================================
       🎯 RESPONSE FINAL
    ====================================================== */

    const response = {
      token,
      user: {
        id: user.id,
        name: user.name,
        lastName: user.firstSurname ?? null, // ✅ añadido
        email: user.email,
        role: payload.role,
        companyId: payload.companyId,
        branchId: payload.branchId,
        companyName, // ✅ añadido
        photoUrl: user.photoUrl ?? null,
      },
    };

    console.log('✅ LOGIN RESPONSE (BACKEND):', response);

    return response;
  }
}