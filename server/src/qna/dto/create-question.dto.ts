import {
  IsString,
  IsOptional,
  MaxLength,
  IsEmail,
  Matches,
} from 'class-validator';

const STRICT_EMAIL_RE =
  /^[A-Za-z0-9_%+-]+(?:\.[A-Za-z0-9_%+-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;

export class CreateQuestionDto {
  @IsString()
  @MaxLength(1000)
  question!: string;

  @IsString()
  @MaxLength(100)
  author!: string;

  @IsEmail()
  @Matches(STRICT_EMAIL_RE, { message: 'Email is invalid' })
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  phone?: string;
}
