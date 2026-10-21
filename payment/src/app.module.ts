import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { PaymentsModule } from './payments/payments.module';
import { PrismaModule } from './prisma/prisma.module';
import { WalletsController } from './wallets/wallets.controller';

@Module({
  imports: [PrismaModule, PaymentsModule],
  controllers: [HealthController, WalletsController],
})
export class AppModule {}
