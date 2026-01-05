import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(
    @Body() body: { email: string; password: string },
  ) {
    const result = await this.authService.login(
      body.email,
      body.password,
    );

    // 🔥 LOG ABSOLUTO
    console.log('✅ LOGIN RESPONSE (BACKEND):', result);

    return result; // ⬅️ ESTO ES CLAVE
  }
}