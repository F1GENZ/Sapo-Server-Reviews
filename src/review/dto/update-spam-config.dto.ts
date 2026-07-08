import {
  IsInt,
  IsArray,
  IsString,
  IsOptional,
  Min,
  Max,
  ArrayMaxSize,
  MaxLength,
} from 'class-validator';

export class UpdateSpamConfigDto {
  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(5)
  minRating?: number;

  @IsArray()
  @IsOptional()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  blockedWords?: string[];

  @IsInt()
  @IsOptional()
  @Min(0)
  @Max(5000)
  maxContentLength?: number;
}
