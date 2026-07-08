import {
  IsString,
  IsOptional,
  MaxLength,
} from 'class-validator';

export class UpdateQuestionDto {
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  question?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  author?: string;
}
