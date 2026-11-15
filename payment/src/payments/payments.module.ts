import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PasskeyConfirmationService } from './passkey-confirmation.service';
import { PaymentsService } from './payments.service';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, PasskeyConfirmationService],
})
export class PaymentsModule {}
