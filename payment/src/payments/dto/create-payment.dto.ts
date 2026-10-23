import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateIf } from 'class-validator';

export class CreatePaymentDto {
  @IsUUID()
  senderWalletId: string;

  // Destinataire : soit son wallet, soit son e-mail (cas du front, qui ne connaît pas les wallets des autres)
  @ValidateIf((dto: CreatePaymentDto) => dto.recipientEmail === undefined)
  @IsUUID()
  receiverWalletId?: string;

  @ValidateIf((dto: CreatePaymentDto) => dto.receiverWalletId === undefined)
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
