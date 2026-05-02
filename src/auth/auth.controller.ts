import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { AuthGuard } from '@nestjs/passport';
import { Param } from '@nestjs/common';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService, private readonly usersService: UsersService) { }
  @Get('me')
  @UseGuards(AuthGuard('jwt'))
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

  @Post(':id/accept-privacy')
  async acceptPrivacy(@Param('id') id: string) {
    return this.authService.acceptPrivacy(id);
  }
}