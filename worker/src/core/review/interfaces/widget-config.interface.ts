export type FormMode = 'hidden' | 'optional' | 'required';

export type SocialProofConfig = {
  /** Master switch; new features default OFF so existing shops see no UI change. */
  enabled: boolean;
  position: 'bottom-left' | 'bottom-right';
  /** Seconds between popup shows (clamped 8-15). */
  interval_sec: number;
  max_per_session: number;
  /** Feed keeps reviews at or above this rating (4-5 star default). */
  min_rating: number;
};

export const DEFAULT_SOCIAL_PROOF: SocialProofConfig = {
  enabled: false,
  position: 'bottom-left',
  interval_sec: 10,
  max_per_session: 3,
  min_rating: 4,
};

const SOCIAL_PROOF_POSITIONS: readonly SocialProofConfig['position'][] = ['bottom-left', 'bottom-right'];

const clampInt = (value: unknown, fallback: number, min: number, max: number): number => {
  const num = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : NaN;
  if (!Number.isInteger(num)) return fallback;
  return Math.min(Math.max(num, min), max);
};

export const normalizeSocialProof = (raw: unknown): SocialProofConfig => {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const position = source.position;
  return {
    enabled: source.enabled === true,
    position: SOCIAL_PROOF_POSITIONS.includes(position as SocialProofConfig['position']) ? (position as SocialProofConfig['position']) : DEFAULT_SOCIAL_PROOF.position,
    interval_sec: clampInt(source.interval_sec, DEFAULT_SOCIAL_PROOF.interval_sec, 8, 15),
    max_per_session: clampInt(source.max_per_session, DEFAULT_SOCIAL_PROOF.max_per_session, 1, 5),
    min_rating: clampInt(source.min_rating, DEFAULT_SOCIAL_PROOF.min_rating, 1, 5),
  };
};

export interface WidgetConfig {
  formPhoneMode: FormMode;
  formEmailMode?: FormMode;
  formTitleMode?: FormMode;
  formContentMode?: FormMode;
  reviewQnaDisplayMode: 'tabs' | 'stacked';
  autoApprove?: boolean;
  requirePurchaseToReview?: boolean;
  requireLogin?: boolean;
  allowQnA?: boolean;
  allowImage?: boolean;
  allowVideo?: boolean;
  curatedSliderEnabled?: boolean;
  curatedSliderCount?: number;
  social_proof: SocialProofConfig;
}

export const DEFAULT_WIDGET_CONFIG: WidgetConfig = {
  formPhoneMode: 'optional',
  reviewQnaDisplayMode: 'tabs',
  curatedSliderEnabled: true,
  curatedSliderCount: 15,
  social_proof: { ...DEFAULT_SOCIAL_PROOF },
};
