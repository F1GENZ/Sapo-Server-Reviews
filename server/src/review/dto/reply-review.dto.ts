import { IsString, MaxLength } from 'class-validator';

export class ReplyReviewDto {
  @IsString()
  @MaxLength(2000)
  reply!: string;
}
