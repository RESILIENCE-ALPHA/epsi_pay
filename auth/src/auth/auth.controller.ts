import { Body, Controller, Get, Headers, HttpCode, Ip, Post, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { extractBearerToken } from './token.util';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  signup(@Body() dto: SignupDto, @Ip() ip: string, @Headers('user-agent') userAgent?: string) {
    return this.authService.signup(dto.email, dto.password, dto.name, { ip, userAgent });
  }

  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto, @Ip() ip: string, @Headers('user-agent') userAgent?: string) {
    return this.authService.login(dto.email, dto.password, { ip, userAgent });
  }

  @Post('logout')
  @HttpCode(204)
  logout(@Headers('authorization') authorization?: string) {
    return this.authService.logout(this.requireToken(authorization));
  }

  @Get('me')
  me(@Headers('authorization') authorization?: string) {
    return this.authService.me(this.requireToken(authorization));
  }

  private requireToken(authorization?: string): string {
    const token = extractBearerToken(authorization);
    if (!token) throw new UnauthorizedException('MISSING_TOKEN');
    return token;
  }
}
