# Environment Contract

This file defines variable names, validation rules, and production safety defaults for `haravan-app-base`. Values in `.env.example` are placeholders only.

## Principles

- No production secret has a real default.
- Production starts fail closed when required OAuth/OIDC/session/DB/Redis values are missing.
- OIDC verification must not infer issuer/JWKS from untrusted callback data.
- Webhook verification must not run without a configured secret when webhook ingress is enabled.
- Body limits and rate limits are core ingress controls, not optional recipes.

## Variable Groups

### App Runtime

| Name | Required in production | Example placeholder | Rule |
|---|---:|---|---|
| `NODE_ENV` | Yes | `development` | `development`, `test`, or `production`. |
| `PORT` | Yes | `3333` | Integer `1..65535`. |
| `FRONTEND_URL` | Yes | `https://app.example.com` | Absolute `http(s)` origin. Use HTTPS in production. |
| `API_BASE_URL` | Yes | `https://api.example.com` | Absolute `http(s)` origin. Use HTTPS in production. |
| `CORS_ALLOWED_ORIGINS` | Yes | `https://app.example.com` | Comma-separated absolute origins. |
| `TRUST_PROXY` | Production deploy dependent | `false` | `false`, integer hop count, or named trusted proxy setting. Do not use bare `true`. |
| `REQUEST_BODY_LIMIT` | Yes | `1mb` | Express-compatible body limit; must be finite. |
| `WEBHOOK_BODY_LIMIT` | Yes | `256kb` | Lower than generic API limit. |

### Haravan OAuth

| Name | Required in production | Example placeholder | Rule |
|---|---:|---|---|
| `HRV_CLIENT_ID` | Yes | `replace-with-client-id` | Non-empty. |
| `HRV_CLIENT_SECRET` | Yes | `replace-with-client-secret` | Non-empty secret; never committed with real value. |
| `HRV_URL_AUTHORIZE` | Yes | `https://accounts.haravan.com/connect/authorize` | Absolute HTTPS URL. |
| `HRV_URL_CONNECT_TOKEN` | Yes | `https://accounts.haravan.com/connect/token` | Absolute HTTPS URL. |
| `HRV_SCOPE_LOGIN` | Yes | `openid profile email org userinfo` | Must include only login-safe scopes. |
| `HRV_SCOPE_INSTALL` | Yes | `openid profile email org userinfo grant_service wh_api` | Must include `grant_service` for install lifecycle and `wh_api` when auto webhooks enabled. |
| `HRV_LOGIN_CALLBACK_URL` | Yes | `https://api.example.com/api/oauth/install/login/callback` | Must match Haravan app settings. |
| `HRV_INSTALL_CALLBACK_URL` | Yes | `https://api.example.com/api/oauth/install/grandservice` | Must match Haravan app settings. |

### OAuth/OIDC Controls

Canonical names use `HRV_ISSUER_URL`, not source-app aliases.

| Name | Required in production | Example placeholder | Rule |
|---|---:|---|---|
| `HRV_GRANT_TYPE_INSTALL` | Yes | `authorization_code` | Usually `authorization_code`. |
| `HRV_GRANT_TYPE_REFRESH` | Yes | `refresh_token` | Usually `refresh_token`. |
| `HRV_RESPONSE_TYPE` | Yes | `code` | Usually `code`. |
| `HRV_RESPONSE_MODE` | Yes | `query` | Usually `query`. |
| `HRV_ISSUER_URL` | Yes | `https://accounts.haravan.com` | OIDC issuer, no trailing slash after normalization. |
| `HRV_OIDC_DISCOVERY_URL` | Yes unless `HRV_JWKS_URL` set | `https://accounts.haravan.com/.well-known/openid-configuration` | Absolute HTTPS URL. |
| `HRV_JWKS_URL` | Yes unless discovery provides `jwks_uri` | `https://accounts.haravan.com/.well-known/openid-configuration/jwks` | Absolute HTTPS URL. |

Compatibility note: source apps used `HRV_OIDC_ISSUER` in places. The base may read it only as a migration alias, but docs and `.env.example` use `HRV_ISSUER_URL`.

### Webhooks

| Name | Required in production | Example placeholder | Rule |
|---|---:|---|---|
| `HRV_WEBHOOK_URL` | Required when auto subscribe enabled | `https://api.example.com/api/oauth/install/webhooks` | Public HTTPS URL. |
| `HRV_WEBHOOK_SECRET` | Yes | `replace-with-webhook-hmac-secret` | Used only for POST raw-body HMAC verification. |
| `HRV_WEBHOOK_VERIFY_TOKEN` | Yes | `replace-with-webhook-verify-token` | Used only for GET challenge `hub.verify_token`; must differ from `HRV_WEBHOOK_SECRET`. |
| `HRV_WEBHOOK_AUTO_SUBSCRIBE` | Yes | `true` | Must be explicitly `true` or `false`. If true, install attempts registration. |

If `HRV_WEBHOOK_AUTO_SUBSCRIBE=false`, the POST webhook endpoint is still part of V1 core and still requires `HRV_WEBHOOK_SECRET`; the GET challenge still requires `HRV_WEBHOOK_VERIFY_TOKEN`. `HRV_WEBHOOK_URL` is required only when the app should register webhooks automatically.

### Sessions

| Name | Required in production | Example placeholder | Rule |
|---|---:|---|---|
| `APP_SESSION_SECRET` | Yes | `replace-with-32-byte-random-secret` | At least 32 bytes of entropy. Not equal to Haravan client secret. |
| `APP_SESSION_TTL_SECONDS` | Yes | `43200` | Minimum 300 seconds. |
| `SESSION_HANDOFF_TTL_SECONDS` | Yes | `120` | Short TTL, recommended `60..300`. |
| `SESSION_COOKIE_NAME` | No | `haravan_app_session` | HttpOnly cookie name. |
| `SESSION_COOKIE_DOMAIN` | Deploy dependent | blank | Optional; omit for same-origin deployment. |

Cookie policy is part of the auth contract: `HttpOnly`; `Secure` in production; `SameSite=Lax` for same-site deployments; `SameSite=None; Secure` only for intentional cross-site deployments. Unsafe cookie-authenticated routes must validate `Origin`/`Referer` and add CSRF token validation when cross-site cookies are required.

### Redis

| Name | Required in production | Example placeholder | Rule |
|---|---:|---|---|
| `REDIS_HOST` | Yes | `redis.example.internal` | Non-empty. |
| `REDIS_PORT` | Yes | `6379` | Integer `1..65535`. |
| `REDIS_USERNAME` | No | blank | Optional ACL username. |
| `REDIS_PASSWORD` | Deploy dependent | `replace-with-redis-password` | Required if Redis requires auth. |
| `REDIS_TLS` | Production deploy dependent | `false` | Boolean. |
| `REDIS_KEY_PREFIX` | Yes | `haravan-app-base` | Lowercase prefix without spaces. |

Redis production paths must use SCAN or indexed keys, never `KEYS`.

### Database

| Name | Required in production | Example placeholder | Rule |
|---|---:|---|---|
| `DATABASE_URL` | Yes | `postgresql://user:password@host:5432/db?schema=public` | PostgreSQL connection URL. Placeholder only. |
| `DIRECT_URL` | Yes | `postgresql://user:password@host:5432/db?schema=public` | Required because Prisma schema declares `directUrl = env("DIRECT_URL")`. |
| `DATA_ENCRYPTION_KEY` | Yes | `replace-with-base64-32-byte-key` | 32-byte key, base64 or hex per implementation. |

### Public Ingress Limits

| Name | Required in production | Example placeholder | Rule |
|---|---:|---|---|
| `AUTH_RATE_LIMIT_WINDOW_SECONDS` | Yes | `60` | Integer >= 1. |
| `AUTH_RATE_LIMIT_MAX` | Yes | `60` | Integer >= 1. |
| `WEBHOOK_RATE_LIMIT_WINDOW_SECONDS` | Yes | `60` | Integer >= 1. |
| `WEBHOOK_RATE_LIMIT_MAX` | Yes | `300` | Integer >= 1. |
| `SESSION_EXCHANGE_RATE_LIMIT_MAX` | Yes | `60` | Integer >= 1. |
| `PUBLIC_WRITE_RATE_LIMIT_WINDOW_SECONDS` | Yes | `60` | Integer >= 1. Window for public review/question submissions per store + client. |
| `PUBLIC_WRITE_RATE_LIMIT_MAX` | Yes | `20` | Integer >= 1. Max submissions allowed per window. |

### Readiness

| Name | Required in production | Example placeholder | Rule |
|---|---:|---|---|
| `READINESS_TOKEN` | Yes | `replace-with-monitoring-token` | Protects `/readyz`. Must not protect `/livez`. |
| `BUILD_SHA` | No | `local` | Build metadata only; safe to expose through protected readiness. |

## Production Fail-Closed Rules

Server must refuse to start in `NODE_ENV=production` when any of these are missing:

- App runtime: `FRONTEND_URL`, `API_BASE_URL`, `CORS_ALLOWED_ORIGINS`, body limits.
- OAuth: client id/secret, authorize URL, token URL, callback URLs, grant/response values.
- OIDC: issuer plus either discovery or JWKS URL.
- Sessions: app session secret and TTLs.
- Redis: host, port, prefix.
- DB: `DATABASE_URL`, `DIRECT_URL`, `DATA_ENCRYPTION_KEY`.
- Public ingress limits: all auth/webhook/session exchange rate-limit variables, plus `PUBLIC_WRITE_RATE_LIMIT_WINDOW_SECONDS` and `PUBLIC_WRITE_RATE_LIMIT_MAX` for public storefront write endpoints.
- Webhook: explicit `HRV_WEBHOOK_AUTO_SUBSCRIBE`, `HRV_WEBHOOK_SECRET`, `HRV_WEBHOOK_VERIFY_TOKEN`, and `HRV_WEBHOOK_URL` when auto subscribe is true.
- Readiness: `READINESS_TOKEN`.

Production validation must error on invalid integer/boolean values instead of silently falling back to defaults. Every CORS origin must be an absolute HTTPS origin in production. `APP_SESSION_SECRET` must be at least 32 bytes and `DATA_ENCRYPTION_KEY` must decode to exactly 32 bytes from base64 or hex.

## Development Defaults

Development may use safe local defaults for non-secrets:

- `NODE_ENV=development`
- `PORT=3333`
- `FRONTEND_URL=http://localhost:5173`
- `API_BASE_URL=http://localhost:3333`
- local body/rate limits

Development must still require placeholders for Haravan client secret, session secret, webhook secret, DB encryption key, and Redis password when those services are exercised.

## `.env.example` Policy

`.env.example` may contain:

- variable names
- fake placeholders
- localhost URLs
- obvious non-secret sample values

It must not contain:

- real Haravan app credentials
- real Redis/DB URLs
- real domains from existing apps
- access tokens or refresh tokens
- copied source-app `.env` values
