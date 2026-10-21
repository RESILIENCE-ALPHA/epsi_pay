import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class SignupDto {
  @IsEmail()
  @MaxLength(255)
  email: string;

  // 12 caractères min., au moins une minuscule, une majuscule et un chiffre
  @IsString()
  @MinLength(12)
  @MaxLength(72) // limite bcrypt
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, { message: 'password must contain a lowercase letter, an uppercase letter and a digit' })
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;
}
