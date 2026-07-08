# Architecture and API Contracts

This document freezes the Phase 2 target architecture for `haravan-app-base`. Phase 3/4 implementation should change this only when the contract is proven wrong by source docs or tests.

## Workspace Shape

```text
C:\Users\Admin\Desktop\haravan-app-base\
  client/                         # React + Vite + TypeScript lifecycle shell
  server/                         # NestJS + Prisma + Redis lifecycle API
  worker/                         # Future optional worker entry, not required by V1 core
  recipes/                        # Docs-only optional modules
  docs/                           # Contracts and handoff docs
  scripts/                        # Verification and anti-pattern scans
```

The current Haravan Theme Ops CLI repo stores the plan only. Runtime app-base code belongs in the separate workspace above.

## Backend Modules

```text
server/src/
  main.ts
  app.module.ts
  config/
    env.schema.ts
  common/
    decorators/shop-auth.decorator.ts
    guards/shop-auth.guard.ts
    security/origin-policy.ts
    security/ingress-rate-limit.service.ts
  database/
    database.module.ts
    prisma.service.ts
  health/
    health.controller.ts
  haravan/
    haravan.controller.ts
    haravan.service.ts
    haravan-api.service.ts
    hmac-verifier.service.ts
    lifecycle-lock.service.ts
    oauth-state.service.ts
    oidc-verifier.service.ts
    session.service.ts
    shop-domain.service.ts
    subscription.service.ts
    token-encryption.service.ts
    uninstall.service.ts
    webhook-registration.service.ts
    webhook.service.ts
    webhook-topic-normalizer.ts
  redis/
    redis.module.ts
    redis.service.ts
```

### Module Responsibilities

| Module | Responsibility | Must not do |
|---|---|---|
| `env.schema.ts` | Parse and validate env. Fail closed in production. | Provide real secret defaults. |
| `oauth-state.service.ts` | Create/consume hashed state and nonce. | Use non-atomic `get` then `del`. |
| `oidc-verifier.service.ts` | Verify id_token through OIDC/JWKS. | Trust `jwt.decode()` identity. |
| `hmac-verifier.service.ts` | Verify raw query/body HMAC with timing-safe compare. | Verify parsed JSON instead of raw body. |
| `session.service.ts` | One-time handoff and HttpOnly app cookie. | Return JS-readable session token in core. |
| `shop-auth.guard.ts` | Validate app session, orgid match, origin for unsafe methods. | Trust frontend local flags. |
| `lifecycle-lock.service.ts` | Owner-token locks and lifecycle generation guards. | Release locks without owner compare. |
| `webhook-registration.service.ts` | Subscribe/ensure lifecycle webhooks and record degraded state. | Silently ignore registration failures. |
| `webhook.service.ts` | Verify, persist, idempotently reduce webhook events. | Mutate state before identity cross-check. |
| `subscription.service.ts` | Normalize subscription snapshots and apply to install. | Require install to exist before storing snapshot. |
| `uninstall.service.ts` | Clear tokens, tombstone domains, preserve merchant data. | Allow refresh to revive tokens. |
| `redis.service.ts` | Namespaced Redis helpers, SCAN, GETDEL/Lua, locks. | Use `KEYS` in production paths. |

## Frontend Modules

```text
client/src/
  main.tsx
  app.tsx
  api/
    api-client.ts
    auth-api.ts
  components/auth/auth-gate.tsx
  config/env.ts
  lib/
    auth-flow.ts
    error-reporter.ts
    get-error-message.ts
    org-context.ts
    query-client.ts
  routes/
    dashboard-page.tsx
    grandservice-page.tsx
    install-login-page.tsx
client/functions/api/[[path]].js
```

### Frontend Rules

- Default API base is same-origin `/api`.
- `withCredentials` is enabled so HttpOnly cookie is sent.
- `orgid` may be stored as UI context only; it is not an auth proof.
- No Haravan token is stored or rendered.
- No internal bearer/session token storage in V1 core.
- OAuth/HMAC endpoints are excluded from generic auth interceptors.
- Callback and handoff params are stripped from URL after processing.

## Backend API Routes

| Method | Path | Auth | Contract |
|---|---|---|---|
| `GET` | `/api/oauth/install/login` | Public + auth rate limit | Start login/SSO. If HMAC absent, start OAuth. If installed, still require OAuth proof. |
| `GET` | `/api/oauth/install/login/verify-hmac` | Public + auth rate limit | Verify Haravan Admin raw query HMAC with finite timestamp. On success returns one-time handoff code, not session token. Missing HMAC uses login URL fallback; present-but-invalid/stale HMAC rejects fail-closed. |
| `GET`/`POST` | `/api/oauth/install/login/callback` | Public + auth rate limit | Consume login state, exchange code, verify id_token, create handoff code. |
| `GET` | `/api/oauth/install/grandservice` | Public + auth rate limit | Install callback. Consume install state if Haravan returns it, exchange token, verify id_token, persist install, attempt webhook registration, create handoff code. |
| `GET` | `/api/oauth/install/webhooks` | Public + webhook rate limit | Verify `hub.verify_token`, return `hub.challenge`. No state mutation. |
| `POST` | `/api/oauth/install/webhooks` | Public + webhook rate limit + HMAC | Verify raw body HMAC, persist idempotent event, process lifecycle reducer inline. |
| `POST` | `/api/auth/session/exchange` | Public + auth rate limit | Atomically consume handoff code and set HttpOnly cookie. |
| `POST` | `/api/auth/logout` | App session | Clear app session cookie. |
| `GET` | `/api/app/session` | App session | Minimal protected session probe for frontend dashboard. |
| `GET` | `/livez` | Public | Minimal `{ ok: true }`. No dependency/env details. |
| `GET` | `/readyz` | `Authorization: Bearer $READINESS_TOKEN` | Redis/DB/build/webhook degraded state. No secrets/token material. |

## API Response Shapes

### OAuth start / missing-HMAC fallback

```json
{
  "url": "https://accounts.haravan.com/connect/authorize?...",
  "reason": "sso_required"
}
```

### Session handoff response

```json
{
  "handoffCode": "opaque-one-time-code",
  "orgid": "org-id",
  "redirectTo": "/dashboard"
}
```

`handoffCode` has short TTL and is useless after one exchange.

### Session probe response

```json
{
  "orgid": "org-id",
  "shopDomain": "store.myharavan.com",
  "status": "active",
  "plan": "Pro",
  "webhookStatus": "registered"
}
```

Never include Haravan access/refresh tokens or encrypted token material.

### Webhook delivery response

```json
{
  "ok": true,
  "topic": "app_subscriptions/update",
  "eventId": "evt_...",
  "status": "processed"
}
```

Duplicate delivery returns `ok: true` with `duplicate: true` and does not rerun reducer.

## Frontend Routes

| Route | Contract |
|---|---|
| `/install/login` | Handles Admin launch, HMAC verification, OAuth callback, and fallback login start. |
| `/install/grandservice` | Handles install callback handoff and redirects to safe path/dashboard. |
| `/dashboard` | Minimal protected session probe and lifecycle status display. |

## Redis Namespaces

All keys are prefixed by `REDIS_KEY_PREFIX`.

| Key pattern | TTL | Purpose |
|---|---:|---|
| `{prefix}:oauth-state:{sha256(state)}` | 10 min | Login/install OAuth state + nonce metadata. |
| `{prefix}:session-handoff:{sha256(code)}` | 1-5 min | One-time app session handoff. |
| `{prefix}:app-session:{sessionId}` | session TTL | Optional server-side session record if stateless cookie is not enough. |
| `{prefix}:install:{orgid}` | status dependent | Hot runtime install snapshot. |
| `{prefix}:domain:{normalizedDomain}` | status dependent | Domain to orgid mapping. |
| `{prefix}:subscription:{correlationKey}` | no fixed TTL for active | Pre/post install subscription snapshot. |
| `{prefix}:lock:refresh:{orgid}` | <= 30s | Owner-token refresh lock. |
| `{prefix}:lock:lifecycle:{orgid}` | <= 30s | Install/uninstall lifecycle lock. |
| `{prefix}:rate:{bucket}:{fingerprint}` | window TTL | Ingress rate limiting. |

Redis helpers required in Phase 3:

- `get`, `set`, `del`, `delMany`
- `getDel` or Lua atomic consume
- `setNx` with TTL
- owner compare/delete lock release
- `scanKeys` for operational cleanup only
- `incr`/`expire` or equivalent for rate limiting
- `ping`

## Data Boundary

Prisma is the durable source for install status, token material, domain tombstones, subscription snapshots, and webhook idempotency. Redis is runtime acceleration only. If Redis is empty, backend may rebuild mappings from DB, but must not resurrect uninstalled tokens.

## Optional Features Boundary

These are not core V1 runtime dependencies:

| Recipe | Status |
|---|---|
| Cloudflare Pages proxy | Lightweight deploy recipe and optional client function. |
| PM2 deploy | Lightweight deployment guide. |
| Queue/worker | Docs-only backlog; core uses persisted outbox + inline reducer. |
| Page builder | Docs-only backlog. |
| Metafields UI | Docs-only backlog. |
| R2 uploader | Docs-only backlog. |
| Ops dashboard | Docs-only backlog after queue/worker exists. |

## Security Invariants

- OAuth state, nonce, and handoff code are one-time and atomically consumed.
- OIDC/JWKS verification is mandatory for identity.
- HMAC verification uses raw query/body bytes and timing-safe compare.
- Query/header orgid is never enough for webhook mutation.
- Haravan tokens stay server-side and encrypted at rest.
- App session cookies are `HttpOnly`; production cookies are `Secure` with explicit `SameSite` policy.
- Unsafe cookie-authenticated routes enforce origin/referer validation and add CSRF token validation if cross-site cookies are required.
- Uninstall clears Redis and DB token material and tombstones domains.
- Public endpoints have body limits and rate limits.
- `/livez` is public/minimal; `/readyz` is protected.
