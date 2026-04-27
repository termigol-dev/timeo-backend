import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Post('login')
  async login(@Body() body) {
    console.log('🟡 CONTROLLER START');

    const result = await this.authService.login(
      body.email,
      body.password,
    );

    console.log('🟢 CONTROLLER RETURNING:', result);

    return result;
  }
  
  @Post('register')
  register(@Body() body) {
    return this.authService.register(body);
  }
}