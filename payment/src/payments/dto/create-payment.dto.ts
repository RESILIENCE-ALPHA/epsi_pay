import { IsNumber, IsOptional, IsPositive, IsString, IsUUID, Max, MaxLength } from 'class-validator';

export class CreatePaymentDto {
  @IsUUID()
  senderWalletId: string;

  @IsUUID()
  receiverWalletId: string;

  // DECIMAL(12,2) : 2 décimales max, 9 999 999 999.99 max
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(9_999_999_999.99)
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
