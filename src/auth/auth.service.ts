import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service'; // 👈 AÑADIDO
import * as bcrypt from 'bcryptjs';
import {
  isCompanyOperational,
  shouldExpireTrial,
} from '../billing/utils/subscription.utils';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private usersService: UsersService, // 👈 AÑADIDO
  ) { }

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

    // 🔐 CHECK PRIVACIDAD (AQUÍ)
    if (!user.acceptedPrivacy || user.privacyVersion !== 'v1.0') {
      console.log('⚠️ PRIVACY NOT ACCEPTED');

      return {
        requiresPrivacyAcceptance: true,
        userId: user.id,
        email: user.email,
      };
    }

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
      email: user.email,
      role: membership?.role ?? 'NO_ROLE',
      companyId: membership?.companyId ?? null,
      branchId: membership?.branchId ?? null,
    };

    const token = this.jwt.sign(payload);

    let companyName: string | null = null;
    let companyStatus: string | null = null;

    if (membership?.companyId) {

      const company =
        await this.prisma.company.findUnique({

          where: {
            id: membership.companyId,
          },

          select: {
            commercialName: true,
            subscriptionStatus: true,
          },
        });

      companyName =
        company?.commercialName ?? null;

      companyStatus =
        company?.subscriptionStatus ?? null;
    }

    const response = {

      token,

      user: {

        id: user.id,

        name: user.name,

        lastName:
          user.firstSurname ?? null,

        email: user.email,

        role: payload.role,

        companyId:
          payload.companyId,

        branchId:
          payload.branchId,

        companyName,

        companyStatus,

        photoUrl:
          user.photoUrl ?? null,
      },
    };
    console.log('✅ LOGIN RESPONSE (BACKEND):', response);

    return response;
  }

  async acceptPrivacy(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        acceptedPrivacy: true,
        acceptedPrivacyAt: new Date(),
        privacyVersion: 'v1.0',
      },
    });
  }

  async getMe(userId: string) {
    console.log('🔥 GET ME EJECUTÁNDOSE');
    const membership =
      await this.prisma.membership.findFirst({

        where: {
          userId,
          active: true,
        },

        include: {
          company: true,
        },
      });

    const user =
      await this.prisma.user.findUnique({
        where: {
          id: userId,
        },
      });

    /*
    |--------------------------------------------------------------------------
    | AUTO EXPIRE TRIAL
    |--------------------------------------------------------------------------
    */

    if (
      membership?.company &&
      shouldExpireTrial(
        membership.company
      )
    ) {

      await this.prisma.company.update({

        where: {
          id: membership.company.id,
        },

        data: {
          subscriptionStatus:
            'EXPIRED',
        },
      });

      membership.company.subscriptionStatus =
        'EXPIRED';
    }

    return {

      id: user.id,
      name: user.name,
      email: user.email,
      companyId:
        membership?.companyId || null,
      companyName:
        membership?.company
          ?.commercialName || null,
      role:
        membership?.role || 'NO_ROLE',

      /*
      |--------------------------------------------------------------------------
      | BILLING
      |--------------------------------------------------------------------------
      */

      companyStatus:
        membership?.company
          ?.subscriptionStatus || null,

      canOperate:
        isCompanyOperational(
          membership?.company
        ),
    };
  }

  async register(body: any) {
    const user = await this.usersService.registerCompanyAdmin(body);

    const token = this.jwt.sign({ // 👈 IMPORTANTE: usar this.jwt
      sub: user.id,
      email: user.email,
    });

    return {
      token,
      user,
    };
  }
}