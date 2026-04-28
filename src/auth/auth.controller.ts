import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }
  @Get('me')
  @UseGuards(AuthGuard)
  getMe(@Req() req) {
    return this.authService.getMe(req.user.id);
  }

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