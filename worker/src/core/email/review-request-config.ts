import { isRecord } from './type-guards';

// Per-shop review-request email settings, stored inside app_installs.metadata under the
// 'review_request' key (same namespaced-JSON pattern as widget_config). smtp.pass and api_key are
// AES-256-GCM encrypted (TokenEncryptionService JSON) at rest; the masked read for the dashboard
// never returns plaintext.

export type ReviewRequestBackend = 'smtp' | 'resend' | 'sendgrid';

export type SmtpSettings = {
  host: string;
  port: number;
  user: string;
  /** Encrypted JSON (enc:v1 prefix) or plaintext when encryption is unavailable; never returned by the masked read. */
  pass: string;
  from_email: string;
  from_name: string;
  tls: 'starttls' | 'tls';
};

export type ReviewRequestConfig = {
  enabled: boolean;
  backend: ReviewRequestBackend;
  smtp: SmtpSettings | null;
  /** Encrypted; only for resend/sendgrid. */
  api_key: string;
  /** Sender address for the HTTPS backends (smtp takes its from_email from `smtp`). */
  from_email: string;
  from_name: string;
  delay_days: number;
  discount_code: string;
  subject_tpl: string;
  body_tpl: string;
};

export const REVIEW_REQUEST_METADATA_KEY = 'review_request';

export const DEFAULT_REVIEW_REQUEST_CONFIG: ReviewRequestConfig = {
  enabled: false,
  backend: 'smtp',
  smtp: null,
  api_key: '',
  from_email: '',
  from_name: '',
  delay_days: 3,
  discount_code: '',
  subject_tpl: '',
  body_tpl: '',
};

const BACKENDS: readonly string[] = ['smtp', 'resend', 'sendgrid'];


const text = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);

const normalizeSmtp = (value: unknown): SmtpSettings | null => {
  if (!isRecord(value)) return null;
  const port = typeof value.port === 'number' && Number.isInteger(value.port) ? value.port : 465;
  return {
    host: text(value.host).trim(),
    port: port >= 1 && port <= 65535 ? port : 465,
    user: text(value.user).trim(),
    pass: text(value.pass),
    from_email: text(value.from_email).trim(),
    from_name: text(value.from_name).trim(),
    tls: value.tls === 'tls' ? 'tls' : 'starttls',
  };
};

export const normalizeReviewRequestConfig = (value: unknown): ReviewRequestConfig => {
  const raw = isRecord(value) ? value : {};
  const delay = typeof raw.delay_days === 'number' && Number.isInteger(raw.delay_days) ? raw.delay_days : DEFAULT_REVIEW_REQUEST_CONFIG.delay_days;
  return {
    enabled: raw.enabled === true,
    backend: (BACKENDS.includes(String(raw.backend)) ? raw.backend : DEFAULT_REVIEW_REQUEST_CONFIG.backend) as ReviewRequestBackend,
    smtp: normalizeSmtp(raw.smtp),
    api_key: text(raw.api_key),
    from_email: text(raw.from_email).trim(),
    from_name: text(raw.from_name).trim(),
    delay_days: Math.min(Math.max(delay, 0), 60),
    discount_code: text(raw.discount_code).trim(),
    subject_tpl: text(raw.subject_tpl),
    body_tpl: text(raw.body_tpl),
  };
};

export type ReviewRequestConfigUpdate = {
  enabled?: boolean;
  backend?: string;
  smtp?: {
    host?: string;
    port?: number;
    user?: string;
    /** New password; omit or '' keeps the stored one. */
    pass?: string;
    from_email?: string;
    from_name?: string;
    tls?: string;
  } | null;
  /** New API key; omit or '' keeps the stored one. */
  api_key?: string;
  from_email?: string;
  from_name?: string;
  delay_days?: number;
  discount_code?: string;
  subject_tpl?: string;
  body_tpl?: string;
};

export const isValidBackend = (backend: string): backend is ReviewRequestBackend => BACKENDS.includes(backend);

/**
 * Merges an update into the current config. Secret sealing is the caller's job: `seal` converts a
 * plaintext secret into its stored form. Throws on invalid scalar fields (the caller translates to 400).
 */
export const mergeReviewRequestConfig = (
  current: ReviewRequestConfig,
  dto: ReviewRequestConfigUpdate,
  seal: (plain: string) => string,
  invalid: (message: string) => never,
): ReviewRequestConfig => {
  const next: ReviewRequestConfig = {
    ...current,
    ...(dto.enabled !== undefined ? { enabled: dto.enabled === true } : {}),
    ...(dto.backend !== undefined
      ? isValidBackend(dto.backend)
        ? { backend: dto.backend }
        : invalid(`backend must be one of: ${BACKENDS.join(', ')}`)
      : {}),
    ...(dto.api_key !== undefined && dto.api_key !== '' ? { api_key: seal(dto.api_key.trim()) } : {}),
    ...(dto.from_email !== undefined ? { from_email: String(dto.from_email).trim() } : {}),
    ...(dto.from_name !== undefined ? { from_name: String(dto.from_name).trim() } : {}),
    ...(dto.delay_days !== undefined
      ? Number.isInteger(dto.delay_days) && (dto.delay_days as number) >= 0 && (dto.delay_days as number) <= 60
        ? { delay_days: dto.delay_days as number }
        : invalid('delay_days must be an integer 0-60')
      : {}),
    ...(dto.discount_code !== undefined ? { discount_code: String(dto.discount_code).trim() } : {}),
    ...(dto.subject_tpl !== undefined ? { subject_tpl: String(dto.subject_tpl) } : {}),
    ...(dto.body_tpl !== undefined ? { body_tpl: String(dto.body_tpl) } : {}),
  };
  if (dto.smtp !== undefined) {
    if (dto.smtp === null) {
      next.smtp = null;
    } else if (!isRecord(dto.smtp)) {
      invalid('smtp must be an object');
    } else {
      const base = current.smtp ?? { host: '', port: 465, user: '', pass: '', from_email: '', from_name: '', tls: 'starttls' as const };
      const patch = dto.smtp;
      next.smtp = {
        host: patch.host !== undefined ? String(patch.host).trim() : base.host,
        port:
          patch.port !== undefined
            ? Number.isInteger(patch.port) && (patch.port as number) >= 1 && (patch.port as number) <= 65535
              ? (patch.port as number)
              : invalid('smtp.port must be an integer 1-65535')
            : base.port,
        user: patch.user !== undefined ? String(patch.user).trim() : base.user,
        pass: patch.pass ? seal(String(patch.pass)) : base.pass,
        from_email: patch.from_email !== undefined ? String(patch.from_email).trim() : base.from_email,
        from_name: patch.from_name !== undefined ? String(patch.from_name).trim() : base.from_name,
        tls: patch.tls !== undefined ? (patch.tls === 'tls' ? 'tls' : 'starttls') : base.tls,
      };
    }
  }
  return next;
};

/** Masked view for the dashboard: secrets surface only as {set, hint} — never plaintext, never ciphertext. */
export const maskReviewRequestConfig = (config: ReviewRequestConfig, open: (stored: string) => string | null): Record<string, unknown> => {
  const mask = (stored: string): { set: boolean; hint: string } => {
    if (!stored) return { set: false, hint: '' };
    let plain: string | null = null;
    try {
      plain = open(stored);
    } catch {
      plain = null;
    }
    if (plain === null) return { set: true, hint: '' };
    return { set: true, hint: plain.length > 4 ? `***${plain.slice(-4)}` : '***' };
  };
  const pass = config.smtp ? mask(config.smtp.pass) : { set: false, hint: '' };
  const apiKey = mask(config.api_key);
  return {
    enabled: config.enabled,
    backend: config.backend,
    smtp: config.smtp
      ? {
          host: config.smtp.host,
          port: config.smtp.port,
          user: config.smtp.user,
          pass_set: pass.set,
          pass_hint: pass.hint,
          from_email: config.smtp.from_email,
          from_name: config.smtp.from_name,
          tls: config.smtp.tls,
        }
      : null,
    api_key_set: apiKey.set,
    api_key_hint: apiKey.hint,
    from_email: config.from_email,
    from_name: config.from_name,
    delay_days: config.delay_days,
    discount_code: config.discount_code,
    subject_tpl: config.subject_tpl,
    body_tpl: config.body_tpl,
  };
};
