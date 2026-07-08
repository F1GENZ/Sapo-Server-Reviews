import { IsIn, IsOptional } from 'class-validator';

export class UpdateWidgetConfigDto {
  @IsIn(['hidden', 'optional', 'required'])
  @IsOptional()
  formPhoneMode?: 'hidden' | 'optional' | 'required';

  @IsIn(['tabs', 'stacked'])
  @IsOptional()
  reviewQnaDisplayMode?: 'tabs' | 'stacked';
}
