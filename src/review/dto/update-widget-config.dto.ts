import { IsBoolean, IsIn, IsNumber, IsOptional, IsString } from 'class-validator';

const FORM_MODES = ['hidden', 'optional', 'required'] as const;
const DISPLAY_MODES = ['hidden', 'mask', 'full'] as const;

export class UpdateWidgetConfigDto {
  @IsOptional() @IsString() titleText?: string;
  @IsOptional() @IsString() accentColor?: string;
  @IsOptional() @IsString() starColor?: string;
  @IsOptional() @IsString() starBgColor?: string;
  @IsOptional() @IsString() starIconUrl?: string;
  @IsOptional() @IsString() textColor?: string;
  @IsOptional() @IsString() mutedColor?: string;
  @IsOptional() @IsString() bgColor?: string;
  @IsOptional() @IsString() bgAltColor?: string;
  @IsOptional() @IsString() borderColor?: string;
  @IsOptional() @IsString() verifiedColor?: string;
  @IsOptional() @IsNumber() radius?: number;
  @IsOptional() @IsBoolean() autoApprove?: boolean;
  @IsOptional() @IsBoolean() showTitle?: boolean;
  @IsOptional() @IsBoolean() showDate?: boolean;
  @IsOptional() @IsBoolean() showFilter?: boolean;
  @IsOptional() @IsBoolean() showSort?: boolean;
  @IsOptional() @IsIn(DISPLAY_MODES) emailDisplay?: string;
  @IsOptional() @IsIn(DISPLAY_MODES) phoneDisplay?: string;
  @IsOptional() @IsIn(FORM_MODES) formEmailMode?: string;
  @IsOptional() @IsIn(FORM_MODES) formPhoneMode?: 'hidden' | 'optional' | 'required';
  @IsOptional() @IsIn(FORM_MODES) formTitleMode?: string;
  @IsOptional() @IsIn(FORM_MODES) formContentMode?: string;
  @IsOptional() @IsIn(['list', 'grid', 'masonry']) reviewLayout?: string;
  @IsOptional() @IsIn(['tabs', 'stacked']) reviewQnaDisplayMode?: 'tabs' | 'stacked';
  @IsOptional() @IsNumber() reviewItemsPerPage?: number;
  @IsOptional() @IsBoolean() allowImage?: boolean;
  @IsOptional() @IsBoolean() allowVideo?: boolean;
  @IsOptional() @IsBoolean() allowQnA?: boolean;
  @IsOptional() @IsString() qnaDisplayMode?: string;
  @IsOptional() @IsNumber() qnaItemsPerPage?: number;
  @IsOptional() @IsBoolean() allowReply?: boolean;
  @IsOptional() @IsString() replyBadgeText?: string;
  @IsOptional() @IsString() replyBgColor?: string;
  @IsOptional() @IsString() replyBorderColor?: string;
  @IsOptional() @IsBoolean() showVerified?: boolean;
  @IsOptional() @IsBoolean() showVerifiedAll?: boolean;
  @IsOptional() @IsBoolean() requireLogin?: boolean;
  @IsOptional() @IsBoolean() requirePurchaseToReview?: boolean;
}
