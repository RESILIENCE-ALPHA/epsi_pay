import { Module } from '@nestjs/common';
import { PasskeysController } from '../passkeys/passkeys.controller';
import { PasskeysService } from '../passkeys/passkeys.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  controllers: [AuthController, PasskeysController],
  providers: [AuthService, PasskeysService],
})
export class AuthModule {}
