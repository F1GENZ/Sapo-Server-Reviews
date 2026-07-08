export type AppEnv = {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  FRONTEND_URL: string;
  API_BASE_URL: string;
  CORS_ALLOWED_ORIGINS: string[];
  TRUST_PROXY: boolean | number | string;
  REQUEST_BODY_LIMIT: string;
  WEBHOOK_BODY_LIMIT: string;

  SAPO_CLIENT_ID: string;
  SAPO_CLIENT_SECRET: string;
  SAPO_SCOPE: string;
  SAPO_INSTALL_CALLBACK_URL: string;
  SAPO_LOGIN_CALLBACK_URL: string;

  SAPO_WEBHOOK_SECRET: string;

  SAPO_API_MAX_CONCURRENT: number;
  SAPO_API_MIN_INTERVAL_MS: number;

  R2_WORKER_URL: string;
  R2_UPLOAD_SECRET: string;
  R2_PUBLIC_DOMAIN: string;

  APP_SESSION_SECRET: string;
  APP_SESSION_TTL_SECONDS: number;
  SESSION_HANDOFF_TTL_SECONDS: number;
  SESSION_COOKIE_NAME: string;
  SESSION_COOKIE_DOMAIN: string;

  REDIS_HOST: string;
  REDIS_PORT: number;
  REDIS_USERNAME: string;
  REDIS_PASSWORD: string;
  REDIS_TLS: boolean;
  REDIS_KEY_PREFIX: string;

  DATABASE_URL: string;
  DIRECT_URL: string;
  DATA_ENCRYPTION_KEY: string;

  AUTH_RATE_LIMIT_WINDOW_SECONDS: number;
  AUTH_RATE_LIMIT_MAX: number;
  WEBHOOK_RATE_LIMIT_WINDOW_SECONDS: number;
  WEBHOOK_RATE_LIMIT_MAX: number;
  SESSION_EXCHANGE_RATE_LIMIT_MAX: number;

  READINESS_TOKEN: string;
  BUILD_SHA: string;
};

type RawEnv = Record<string, string | undefined>;

type IntegerOptions = { min?: number; max?: number };

const BOOLEAN_TRUE = new Set(['1', 'true', 'yes', 'on']);
const BOOLEAN_FALSE = new Set(['0', 'false', 'no', 'off']);

const URL_KEYS = [
  'FRONTEND_URL',
  'API_BASE_URL',
  'SAPO_INSTALL_CALLBACK_URL',
  'SAPO_LOGIN_CALLBACK_URL',
] as const;

const PLACEHOLDER_CHECK_KEYS = [
  'SAPO_CLIENT_ID',
  'SAPO_CLIENT_SECRET',
  'SAPO_WEBHOOK_SECRET',
  'APP_SESSION_SECRET',
  'REDIS_PASSWORD',
  'DATABASE_URL',
  'DIRECT_URL',
  'DATA_ENCRYPTION_KEY',
  'READINESS_TOKEN',
] as const;

const BODY_LIMIT_REGEX = /^\d+(?:\.\d+)?\s*(?:b|kb|mb)$/i;
const REDIS_KEY_PREFIX_REGEX = /^[a-z0-9][a-z0-9-]*$/;

const trim = (value: string | undefined): string =>
  typeof value === 'string' ? value.trim() : '';

const splitCsv = (value: string): string[] =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const parseBoolean = (
  raw: string,
  key: string,
  errors: string[],
  fallback: boolean,
): boolean => {
  if (!raw) return fallback;
  const normalized = raw.toLowerCase();
  if (BOOLEAN_TRUE.has(normalized)) return true;
  if (BOOLEAN_FALSE.has(normalized)) return false;
  errors.push(`${key} must be a boolean: true/false/1/0/yes/no/on/off`);
  return fallback;
};

const parseInteger = (
  raw: string,
  key: string,
  errors: string[],
  fallback: number,
  options: IntegerOptions = {},
): number => {
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    errors.push(`${key} must be an integer`);
    return fallback;
  }
  if (options.min !== undefined && parsed < options.min) {
    errors.push(`${key} must be >= ${options.min}`);
    return fallback;
  }
  if (options.max !== undefined && parsed > options.max) {
    errors.push(`${key} must be <= ${options.max}`);
    return fallback;
  }
  return parsed;
};

const parseTrustProxy = (raw: string, errors: string[]): boolean | number | string => {
  const normalized = raw.trim().toLowerCase();
  if (!normalized || normalized === 'false') return false;
  if (normalized === 'true') {
    errors.push('TRUST_PROXY must not be true; use false, a bounded hop count, or a safe named proxy value');
    return false;
  }
  const parsed = Number(raw);
  if (Number.isInteger(parsed) && parsed >= 0) return parsed;
  if (/^[a-z0-9_.:-]+$/i.test(raw)) return raw;
  errors.push('TRUST_PROXY must be false, a non-negative integer, or a safe named proxy value');
  return false;
};

const isHttpUrl = (value: string, requireHttps: boolean): boolean => {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    return !requireHttps || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const assertUrl = (
  errors: string[],
  key: string,
  value: string,
  requireHttps: boolean,
): void => {
  if (!value) return;
  if (!isHttpUrl(value, requireHttps)) {
    errors.push(`${key} must be an absolute ${requireHttps ? 'HTTPS' : 'HTTP(S)'} URL`);
  }
};

const isPlaceholder = (value: string): boolean =>
  /(replace-with|change-me|changeme|placeholder|your-|todo)/i.test(value);

const decodedKeyLength = (value: string): number => {
  if (/^[a-f0-9]{64}$/i.test(value)) return Buffer.from(value, 'hex').length;
  try {
    return Buffer.from(value, 'base64').length;
  } catch {
    return 0;
  }
};

const requireProduction = (
  env: AppEnv,
  keys: Array<keyof AppEnv>,
  errors: string[],
): void => {
  for (const key of keys) {
    const value = env[key];
    const missingArray = Array.isArray(value) && value.length === 0;
    if (value === '' || missingArray) errors.push(`${key} is required in production`);
  }
};

const requireRawProduction = (
  env: RawEnv,
  keys: string[],
  errors: string[],
): void => {
  for (const key of keys) {
    if (!trim(env[key])) errors.push(`${key} must be explicitly set in production`);
  }
};

export const loadEnv = (env: RawEnv = process.env): AppEnv => {
  const errors: string[] = [];
  const NODE_ENV = (trim(env.NODE_ENV) || 'development') as AppEnv['NODE_ENV'];
  const isProduction = NODE_ENV === 'production';

  const appEnv: AppEnv = {
    NODE_ENV,
    PORT: parseInteger(trim(env.PORT), 'PORT', errors, 3000, { min: 1, max: 65535 }),
    FRONTEND_URL: trim(env.FRONTEND_URL) || 'http://localhost:5173',
    API_BASE_URL: trim(env.API_BASE_URL) || 'http://localhost:3000',
    CORS_ALLOWED_ORIGINS: splitCsv(trim(env.CORS_ALLOWED_ORIGINS)),
    TRUST_PROXY: parseTrustProxy(trim(env.TRUST_PROXY) || 'false', errors),
    REQUEST_BODY_LIMIT: trim(env.REQUEST_BODY_LIMIT) || '1mb',
    WEBHOOK_BODY_LIMIT: trim(env.WEBHOOK_BODY_LIMIT) || '256kb',

    SAPO_CLIENT_ID: trim(env.SAPO_CLIENT_ID),
    SAPO_CLIENT_SECRET: trim(env.SAPO_CLIENT_SECRET),
    SAPO_SCOPE: trim(env.SAPO_SCOPE) || 'read_products write_products read_orders write_orders read_customers write_customers read_script_tags write_script_tags read_themes write_themes',
    SAPO_INSTALL_CALLBACK_URL: trim(env.SAPO_INSTALL_CALLBACK_URL),
    SAPO_LOGIN_CALLBACK_URL: trim(env.SAPO_LOGIN_CALLBACK_URL),

    SAPO_WEBHOOK_SECRET: trim(env.SAPO_WEBHOOK_SECRET),

    SAPO_API_MAX_CONCURRENT: parseInteger(
      trim(env.SAPO_API_MAX_CONCURRENT),
      'SAPO_API_MAX_CONCURRENT',
      errors,
      4,
      { min: 1 },
    ),
    SAPO_API_MIN_INTERVAL_MS: parseInteger(
      trim(env.SAPO_API_MIN_INTERVAL_MS),
      'SAPO_API_MIN_INTERVAL_MS',
      errors,
      250,
      { min: 0 },
    ),

    R2_WORKER_URL: trim(env.R2_WORKER_URL) || '',
    R2_UPLOAD_SECRET: trim(env.R2_UPLOAD_SECRET) || '',
    R2_PUBLIC_DOMAIN: trim(env.R2_PUBLIC_DOMAIN) || '',

    APP_SESSION_SECRET: trim(env.APP_SESSION_SECRET),
    APP_SESSION_TTL_SECONDS: parseInteger(
      trim(env.APP_SESSION_TTL_SECONDS),
      'APP_SESSION_TTL_SECONDS',
      errors,
      12 * 60 * 60,
      { min: 300 },
    ),
    SESSION_HANDOFF_TTL_SECONDS: parseInteger(
      trim(env.SESSION_HANDOFF_TTL_SECONDS),
      'SESSION_HANDOFF_TTL_SECONDS',
      errors,
      120,
      { min: 30 },
    ),
    SESSION_COOKIE_NAME: trim(env.SESSION_COOKIE_NAME) || 'sapo_app_session',
    SESSION_COOKIE_DOMAIN: trim(env.SESSION_COOKIE_DOMAIN),

    REDIS_HOST: trim(env.REDIS_HOST),
    REDIS_PORT: parseInteger(trim(env.REDIS_PORT), 'REDIS_PORT', errors, 6379, {
      min: 1,
      max: 65535,
    }),
    REDIS_USERNAME: trim(env.REDIS_USERNAME),
    REDIS_PASSWORD: trim(env.REDIS_PASSWORD),
    REDIS_TLS: parseBoolean(trim(env.REDIS_TLS), 'REDIS_TLS', errors, false),
    REDIS_KEY_PREFIX: trim(env.REDIS_KEY_PREFIX) || 'sapo-app-base',

    DATABASE_URL: trim(env.DATABASE_URL),
    DIRECT_URL: trim(env.DIRECT_URL),
    DATA_ENCRYPTION_KEY: trim(env.DATA_ENCRYPTION_KEY),

    AUTH_RATE_LIMIT_WINDOW_SECONDS: parseInteger(
      trim(env.AUTH_RATE_LIMIT_WINDOW_SECONDS),
      'AUTH_RATE_LIMIT_WINDOW_SECONDS',
      errors,
      60,
      { min: 1 },
    ),
    AUTH_RATE_LIMIT_MAX: parseInteger(trim(env.AUTH_RATE_LIMIT_MAX), 'AUTH_RATE_LIMIT_MAX', errors, 60, {
      min: 1,
    }),
    WEBHOOK_RATE_LIMIT_WINDOW_SECONDS: parseInteger(
      trim(env.WEBHOOK_RATE_LIMIT_WINDOW_SECONDS),
      'WEBHOOK_RATE_LIMIT_WINDOW_SECONDS',
      errors,
      60,
      { min: 1 },
    ),
    WEBHOOK_RATE_LIMIT_MAX: parseInteger(
      trim(env.WEBHOOK_RATE_LIMIT_MAX),
      'WEBHOOK_RATE_LIMIT_MAX',
      errors,
      300,
      { min: 1 },
    ),
    SESSION_EXCHANGE_RATE_LIMIT_MAX: parseInteger(
      trim(env.SESSION_EXCHANGE_RATE_LIMIT_MAX),
      'SESSION_EXCHANGE_RATE_LIMIT_MAX',
      errors,
      60,
      { min: 1 },
    ),

    READINESS_TOKEN: trim(env.READINESS_TOKEN),
    BUILD_SHA: trim(env.BUILD_SHA) || 'local',
  };

  if (!['development', 'test', 'production'].includes(appEnv.NODE_ENV)) {
    errors.push('NODE_ENV must be development, test, or production');
  }

  for (const key of URL_KEYS) {
    assertUrl(errors, key, appEnv[key], isProduction);
  }

  for (const origin of appEnv.CORS_ALLOWED_ORIGINS) {
    if (!isHttpUrl(origin, isProduction)) {
      errors.push(`CORS_ALLOWED_ORIGINS contains invalid origin: ${origin}`);
    }
  }

  if (appEnv.REQUEST_BODY_LIMIT && !BODY_LIMIT_REGEX.test(appEnv.REQUEST_BODY_LIMIT)) {
    errors.push('REQUEST_BODY_LIMIT must be a finite byte/kb/mb value');
  }

  if (appEnv.WEBHOOK_BODY_LIMIT && !BODY_LIMIT_REGEX.test(appEnv.WEBHOOK_BODY_LIMIT)) {
    errors.push('WEBHOOK_BODY_LIMIT must be a finite byte/kb/mb value');
  }

  if (appEnv.REDIS_KEY_PREFIX && !REDIS_KEY_PREFIX_REGEX.test(appEnv.REDIS_KEY_PREFIX)) {
    errors.push('REDIS_KEY_PREFIX must be lowercase kebab-case without spaces');
  }

  // Secrets must be distinct — fail startup if any two are identical
  const secrets = [
    { key: 'APP_SESSION_SECRET', value: appEnv.APP_SESSION_SECRET },
    { key: 'SAPO_CLIENT_SECRET', value: appEnv.SAPO_CLIENT_SECRET },
    { key: 'SAPO_WEBHOOK_SECRET', value: appEnv.SAPO_WEBHOOK_SECRET },
  ];
  for (let i = 0; i < secrets.length; i++) {
    for (let j = i + 1; j < secrets.length; j++) {
      if (secrets[i].value && secrets[j].value && secrets[i].value === secrets[j].value) {
        errors.push(`${secrets[i].key} and ${secrets[j].key} must be distinct`);
      }
    }
  }

  if (isProduction) {
    requireProduction(
      appEnv,
      [
        'FRONTEND_URL',
        'API_BASE_URL',
        'CORS_ALLOWED_ORIGINS',
        'REQUEST_BODY_LIMIT',
        'WEBHOOK_BODY_LIMIT',
        'SAPO_CLIENT_ID',
        'SAPO_CLIENT_SECRET',
        'SAPO_SCOPE',
        'SAPO_INSTALL_CALLBACK_URL',
        'SAPO_LOGIN_CALLBACK_URL',
        'SAPO_WEBHOOK_SECRET',
        'APP_SESSION_SECRET',
        'DATABASE_URL',
        'DIRECT_URL',
        'DATA_ENCRYPTION_KEY',
        'REDIS_HOST',
        'REDIS_KEY_PREFIX',
        'READINESS_TOKEN',
        'AUTH_RATE_LIMIT_WINDOW_SECONDS',
        'AUTH_RATE_LIMIT_MAX',
        'WEBHOOK_RATE_LIMIT_WINDOW_SECONDS',
        'WEBHOOK_RATE_LIMIT_MAX',
        'SESSION_EXCHANGE_RATE_LIMIT_MAX',
      ],
      errors,
    );

    requireRawProduction(
      env,
      [
        'PORT',
        'REQUEST_BODY_LIMIT',
        'WEBHOOK_BODY_LIMIT',
        'SAPO_SCOPE',
        'APP_SESSION_TTL_SECONDS',
        'SESSION_HANDOFF_TTL_SECONDS',
        'REDIS_PORT',
        'REDIS_KEY_PREFIX',
        'SAPO_API_MAX_CONCURRENT',
        'SAPO_API_MIN_INTERVAL_MS',
        'AUTH_RATE_LIMIT_WINDOW_SECONDS',
        'AUTH_RATE_LIMIT_MAX',
        'WEBHOOK_RATE_LIMIT_WINDOW_SECONDS',
        'WEBHOOK_RATE_LIMIT_MAX',
        'SESSION_EXCHANGE_RATE_LIMIT_MAX',
      ],
      errors,
    );

    for (const key of PLACEHOLDER_CHECK_KEYS) {
      const value = appEnv[key];
      if (value && isPlaceholder(value)) errors.push(`${key} must not be a placeholder in production`);
    }

    if (appEnv.APP_SESSION_SECRET && Buffer.byteLength(appEnv.APP_SESSION_SECRET, 'utf8') < 32) {
      errors.push('APP_SESSION_SECRET must be at least 32 bytes in production');
    }

    if (appEnv.DATA_ENCRYPTION_KEY && decodedKeyLength(appEnv.DATA_ENCRYPTION_KEY) !== 32) {
      errors.push('DATA_ENCRYPTION_KEY must decode to exactly 32 bytes from base64 or hex');
    }
  }

  if (errors.length) {
    throw new Error(`Invalid environment:\n${errors.map((error) => `- ${error}`).join('\n')}`);
  }

  return appEnv;
};
