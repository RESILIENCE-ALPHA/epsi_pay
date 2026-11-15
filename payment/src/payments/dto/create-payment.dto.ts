import { Transform, Type } from 'class-transformer';
import { IsEmail, IsObject, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateIf, ValidateNested } from 'class-validator';

// Signature passkey (empreinte ou visage vérifié sur l'appareil) obtenue via POST /payments/passkey-options
export class PasskeyAssertionDto {
  @IsUUID()
  challengeId: string;

  // Réponse brute du navigateur (navigator.credentials.get), contrôlée par @simplewebauthn/server
  @IsObject()
  response: Record<string, unknown>;
}

// Contenu du paiement : c'est ce que la passkey signe (POST /payments/passkey-options)
export class PaymentDetailsDto {
  @IsUUID()
  senderWalletId: string;

  // Destinataire : soit son wallet, soit son e-mail (cas du front, qui ne connaît pas les wallets des autres)
  @ValidateIf((dto: PaymentDetailsDto) => dto.recipientEmail === undefined)
  @IsUUID()
  receiverWalletId?: string;

  @ValidateIf((dto: PaymentDetailsDto) => dto.receiverWalletId === undefined)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(254)
  recipientEmail?: string;

  // Accepte 10, 10.5 ou "10.00" ; gardé en chaîne pour un Decimal exact.
  // DECIMAL(12,2) : 2 décimales max, 9 999 999 999.99 max
  @Transform(({ value }) => (typeof value === 'number' && Number.isFinite(value) ? String(value) : value))
  @Matches(/^\d{1,10}(\.\d{1,2})?$/, { message: 'INVALID_AMOUNT' })
  amount: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}

export class CreatePaymentDto extends PaymentDetailsDto {
  // Obligatoire dès que l'utilisateur a enregistré au moins une passkey
  @IsOptional()
  @ValidateNested()
  @Type(() => PasskeyAssertionDto)
  passkey?: PasskeyAssertionDto;
}
