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

  if (!user) {
    console.log('❌ USER NOT FOUND');
    throw new UnauthorizedException('Credenciales incorrectas');
  }

  console.log('✅ USER ACTIVE:', user.active);
  console.log('🔑 HASH IN DB:', user.password);

  const valid = await bcrypt.compare(password, user.password);
  console.log('🔍 PASSWORD VALID:', valid);

  if (!user.active || !valid) {
    throw new UnauthorizedException('Credenciales incorrectas');
  }

  // ⬇️ deja el resto tal cual
  }
}