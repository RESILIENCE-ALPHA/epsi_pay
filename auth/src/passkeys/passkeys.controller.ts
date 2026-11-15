import { Body, Controller, Get, Headers, HttpCode, Ip, Param, ParseUUIDPipe, Post, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { extractBearerToken } from '../auth/token.util';
import { ConfirmPasswordDto, PasskeyResponseDto, RegisterPasskeyDto } from './dto/passkey.dto';
import { PasskeysService } from './passkeys.service';

// Passkeys (WebAuthn) : connexion par empreinte digitale ou reconnaissance faciale de l'appareil
@Controller('passkeys')
export class PasskeysController {
  constructor(
    private readonly passkeysService: PasskeysService,
    private readonly authService: AuthService,
  ) {}

  @Post('login/options')
  @HttpCode(200)
  loginOptions() {
    return this.passkeysService.loginOptions();
  }

  @Post('login/verify')
  @HttpCode(200)
  login(@Body() dto: PasskeyResponseDto, @Ip() ip: string, @Headers('user-agent') userAgent?: string) {
    return this.passkeysService.login(dto.challengeId, dto.response, { ip, userAgent });
  }

  @Get()
  async list(@Headers('authorization') authorization?: string) {
    const userId = await this.currentUserId(authorization);
    return this.passkeysService.list(userId);
  }

  @Post('register/options')
  @HttpCode(200)
  async registrationOptions(
    @Body() dto: ConfirmPasswordDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const userId = await this.currentUserId(authorization);
    return this.passkeysService.registrationOptions(userId, dto.password, { ip, userAgent });
  }

  @Post('register/verify')
  async register(
    @Body() dto: RegisterPasskeyDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const userId = await this.currentUserId(authorization);
    return this.passkeysService.register(userId, dto.challengeId, dto.response, dto.name, { ip, userAgent });
  }

  @Post(':id/revoke')
  @HttpCode(204)
  async revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmPasswordDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const userId = await this.currentUserId(authorization);
    await this.passkeysService.revoke(userId, id, dto.password, { ip, userAgent });
  }

  private async currentUserId(authorization?: string): Promise<string> {
    const token = extractBearerToken(authorization);
    if (!token) throw new UnauthorizedException('MISSING_TOKEN');
    const { user } = await this.authService.me(token);
    return user.id;
  }
}
