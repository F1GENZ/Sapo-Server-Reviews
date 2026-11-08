import type { AppEnv } from './core/config/env.schema';

export interface WorkerEnv {
  STORE_DO?: DurableObjectNamespace;
  STORE?: DurableObjectNamespace;
  MEDIA_BUCKET?: R2Bucket;
  ASSETS?: Fetcher;
  AI?: {
    run(model: string, inputs: Record<string, unknown>): Promise<unknown>;
  };
  ANALYTICS?: {
    writeDataPoint(point: { blobs?: string[]; doubles?: number[]; indexes?: string[] }): void;
  };
  EVENTS_QUEUE?: {
    send(body: unknown): Promise<unknown>;
  };
  PUBLIC_SAPO_RATE_LIMITER?: {
    limit(opts: { key: string }): Promise<{ success: boolean }>;
  };
  NODE_ENV?: string;
  PORT?: string;
  FRONTEND_URL?: string;
  API_BASE_URL?: string;
  CORS_ALLOWED_ORIGINS?: string;
  REQUEST_BODY_LIMIT?: string;
  WEBHOOK_BODY_LIMIT?: string;

  SAPO_CLIENT_ID?: string;
  SAPO_CLIENT_SECRET?: string;
  SAPO_SCOPE?: string;
  SAPO_INSTALL_CALLBACK_URL?: string;
  SAPO_LOGIN_CALLBACK_URL?: string;
  SAPO_API_MAX_CONCURRENT?: string;

  R2_WORKER_URL?: string;
  R2_UPLOAD_SECRET?: string;
  R2_PUBLIC_DOMAIN?: string;

  APP_SESSION_SECRET?: string;
  APP_SESSION_TTL_SECONDS?: string;
  SESSION_HANDOFF_TTL_SECONDS?: string;
  SESSION_COOKIE_NAME?: string;
  APP_SESSION_COOKIE_NAME?: string;
  SESSION_COOKIE_DOMAIN?: string;

  REDIS_KEY_PREFIX?: string;
  DATA_ENCRYPTION_KEY?: string;

  AUTH_RATE_LIMIT_WINDOW_SECONDS?: string;
  AUTH_RATE_LIMIT_MAX?: string;
  SESSION_EXCHANGE_RATE_LIMIT_MAX?: string;
  PUBLIC_RATE_LIMIT_WINDOW_SECONDS?: string;
  PUBLIC_RATE_LIMIT_MAX?: string;
  PUBLIC_WRITE_RATE_LIMIT_WINDOW_SECONDS?: string;
  PUBLIC_WRITE_RATE_LIMIT_MAX?: string;

  READINESS_TOKEN?: string;
  MIGRATION_IMPORT_TOKEN?: string;
  BUILD_SHA?: string;
  AI_MODEL?: string;
}

export const buildAppEnv = (raw: WorkerEnv): AppEnv => {
  const nodeEnv =
    raw.NODE_ENV === 'production' || raw.NODE_ENV === 'test' ? raw.NODE_ENV : 'development';
  const corsList = String(raw.CORS_ALLOWED_ORIGINS ?? 'https://reviews-sapo.f1genz.dev')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  return {
    NODE_ENV: nodeEnv,
    PORT: Number(raw.PORT ?? 3021),
    LISTEN_HOST: '0.0.0.0',
    FRONTEND_URL: String(raw.FRONTEND_URL ?? 'https://reviews-sapo.f1genz.dev').replace(/\/+$/, ''),
    API_BASE_URL: String(raw.API_BASE_URL ?? 'https://api-sapo-reviews.f1genz.dev').replace(/\/+$/, ''),
    CORS_ALLOWED_ORIGINS: corsList,
    TRUST_PROXY: true,
    REQUEST_BODY_LIMIT: String(raw.REQUEST_BODY_LIMIT ?? '1mb'),
    WEBHOOK_BODY_LIMIT: String(raw.WEBHOOK_BODY_LIMIT ?? '256kb'),

    SAPO_CLIENT_ID: String(raw.SAPO_CLIENT_ID ?? ''),
    SAPO_CLIENT_SECRET: String(raw.SAPO_CLIENT_SECRET ?? ''),
    SAPO_SCOPE: String(raw.SAPO_SCOPE ?? 'read_products,write_products,read_orders,write_content'),
    SAPO_INSTALL_CALLBACK_URL: String(
      raw.SAPO_INSTALL_CALLBACK_URL ?? 'https://api-sapo-reviews.f1genz.dev/api/oauth/install/login/callback',
    ),
    SAPO_LOGIN_CALLBACK_URL: String(
      raw.SAPO_LOGIN_CALLBACK_URL ?? 'https://api-sapo-reviews.f1genz.dev/api/oauth/install/callback',
    ),
    SAPO_API_MAX_CONCURRENT: Number(raw.SAPO_API_MAX_CONCURRENT ?? 2),

    R2_WORKER_URL: String(raw.R2_WORKER_URL ?? 'https://f1genz-sapo-reviews-media.icy-wind-c674.workers.dev').replace(
      /\/+$/,
      '',
    ),
    R2_UPLOAD_SECRET: String(raw.R2_UPLOAD_SECRET ?? ''),
    R2_PUBLIC_DOMAIN: String(raw.R2_PUBLIC_DOMAIN ?? 'images-sapo.f1genz.dev'),

    APP_SESSION_SECRET: String(raw.APP_SESSION_SECRET ?? ''),
    APP_SESSION_TTL_SECONDS: Number(raw.APP_SESSION_TTL_SECONDS ?? 43200),
    SESSION_HANDOFF_TTL_SECONDS: Number(raw.SESSION_HANDOFF_TTL_SECONDS ?? 120),
    SESSION_COOKIE_NAME: String(
      raw.SESSION_COOKIE_NAME ?? raw.APP_SESSION_COOKIE_NAME ?? 'f1genz_review_sapo_session',
    ),
    SESSION_COOKIE_DOMAIN: String(raw.SESSION_COOKIE_DOMAIN ?? ''),

    REDIS_HOST: 'memory',
    REDIS_PORT: 6379,
    REDIS_USERNAME: '',
    REDIS_PASSWORD: '',
    REDIS_TLS: false,
    REDIS_KEY_PREFIX: String(raw.REDIS_KEY_PREFIX ?? 'sapo-review'),

    DATABASE_URL: 'sqlite://store-do',
    DIRECT_URL: 'sqlite://store-do',
    DATA_ENCRYPTION_KEY: String(raw.DATA_ENCRYPTION_KEY ?? ''),

    AUTH_RATE_LIMIT_WINDOW_SECONDS: Number(raw.AUTH_RATE_LIMIT_WINDOW_SECONDS ?? 60),
    AUTH_RATE_LIMIT_MAX: Number(raw.AUTH_RATE_LIMIT_MAX ?? 60),
    SESSION_EXCHANGE_RATE_LIMIT_MAX: Number(raw.SESSION_EXCHANGE_RATE_LIMIT_MAX ?? 60),

    PUBLIC_WRITE_RATE_LIMIT_WINDOW_SECONDS: Number(
      raw.PUBLIC_WRITE_RATE_LIMIT_WINDOW_SECONDS ?? raw.PUBLIC_RATE_LIMIT_WINDOW_SECONDS ?? 60,
    ),
    PUBLIC_WRITE_RATE_LIMIT_MAX: Number(
      raw.PUBLIC_WRITE_RATE_LIMIT_MAX ?? raw.PUBLIC_RATE_LIMIT_MAX ?? 60,
    ),

    READINESS_TOKEN: String(raw.READINESS_TOKEN ?? ''),
    BUILD_SHA: String(raw.BUILD_SHA ?? 'cloudflare-worker'),

    AI_MODEL: String(raw.AI_MODEL ?? '@cf/meta/llama-3.1-8b-instruct-fast'),
  };
};
