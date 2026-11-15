import { IsObject, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

// Ajout ou suppression d'une passkey : mot de passe redemandé, pour qu'un jeton de session volé
// ne suffise pas à enregistrer la passkey de l'attaquant (qui pourrait ensuite valider des paiements)
export class ConfirmPasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password: string;
}

export class PasskeyResponseDto {
  @IsUUID()
  challengeId: string;

  // Réponse brute du navigateur (navigator.credentials), contrôlée par @simplewebauthn/server
  @IsObject()
  response: Record<string, unknown>;
}

export class RegisterPasskeyDto extends PasskeyResponseDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  name?: string;
}
