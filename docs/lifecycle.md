# Haravan App Base Lifecycle Contract

This is the Phase 2 source of truth for lifecycle behavior. Code in Phase 3/4 must follow this document before adding app-specific features.

## Scope

Core V1 covers only:

- Haravan OAuth login/install and app launch.
- One-time session handoff to a HttpOnly app cookie.
- Webhook registration, GET challenge, POST delivery, idempotency, and inline/outbox lifecycle reducers.
- Subscription state, uninstall cleanup, token refresh race safety, Redis runtime state, and Prisma durable state.
- Minimal protected frontend dashboard/session probe.

Out of scope: theme workflows, page builder, R2 uploader, full ops dashboard, CLI generator, MCP server, and app-specific domain tables.

## Stored Status Values

The target stores a deliberately small canonical `AppStatus` enum:

| Stored status | Meaning | Haravan-write paths |
|---|---|---|
| `trial` | Installed and usable under trial/free trial policy. | Allowed if token is fresh. |
| `active` | Paid/accepted subscription or otherwise paid Pro state. | Allowed if token is fresh. |
| `free` | Installed but free plan without paid entitlement. | Allowed only for explicitly free-safe reads/writes. |
| `canceled` | Subscription canceled. | Block writes; require reactivation/reinstall where needed. |
| `expired` | Trial/subscription expired. | Block writes; require reinstall/reauth. |
| `needs_reinstall` | App lacks valid token/scopes or install is incomplete. | Block writes; start install. |
| `declined` | Merchant declined billing or permission flow. | Block writes; start install/billing flow when product defines it. |
| `uninstalled` | App uninstall webhook handled. Tokens cleared; domain mappings tombstoned. | Block all Haravan writes. |

Inbound aliases are normalized before storage:

| Inbound value | Stored status |
|---|---|
| `accepted`, `approved` with current paid subscription | `active` |
| `cancelled` | `canceled` |
| `inactive`, `unactive`, `need_install`, `app_uninstalled` | `needs_reinstall`, except uninstall topics map to `uninstalled` |
| `apps/uninstall`, `apps/uninstalled`, `app/uninstall`, `app/uninstalled`, `app_uninstall`, `app_uninstalled`, `app_uninstall_webhook` | `uninstalled` |

## Lifecycle Generation

Every `AppInstall` has `lifecycleGeneration`.

- New install creates or increments generation.
- Token refresh reads generation before network exchange and conditionally writes only if generation and status still match after exchange.
- Uninstall increments generation before clearing token material.
- Any refresh result arriving after uninstall must be discarded.

This is mandatory because source apps used token refresh locks but did not fully prove uninstall-vs-refresh race safety.

## OAuth Login and Install

### Start login/install

1. Validate optional redirect with the safe redirect rules below.
2. Create random `state` and per-flow `nonce`.
3. Store hashed state key in Redis with metadata:
   - `flow`: `login` or `install`
   - `nonce`
   - `createdAt`
   - optional `orgid`
   - optional safe redirect path
4. TTL: default 10 minutes.
5. Redirect to Haravan authorization URL.

### Callback

1. Atomically consume OAuth state with Redis `GETDEL` or Lua compare/delete.
2. Exchange code with Haravan token endpoint.
3. Verify `id_token` signature and claims through OIDC/JWKS:
   - algorithm allowlist: `RS256`, `RS384`, `RS512` only unless docs prove otherwise
   - issuer equals `HRV_ISSUER_URL`
   - audience contains `HRV_CLIENT_ID`
   - `exp`, `nbf`, `iat` within clock skew
   - nonce equals consumed state nonce
4. Extract and validate `orgid` from verified claims only.
5. Install callback persists tokens server-side; login callback never creates install state.
6. On success create one-time handoff code, not a JS-readable session token.

## Haravan App Launch

Haravan Admin launches may contain `shop`, `orgid`, `timestamp`, and `hmac`.

- If HMAC is present: require a finite `timestamp`, verify raw query semantics, and use timing-safe compare.
- If HMAC is missing: start OAuth SSO.
- If HMAC is present but invalid, stale, or missing `timestamp`: reject fail-closed instead of downgrading to SSO.
- V1 never mints a session directly from public `shop + orgid`.
- Even when install exists, OAuth SSO proves current merchant identity before a new app session is issued.

## Session Handoff and App Session

1. Backend success creates a one-time handoff code in Redis.
2. Handoff payload contains `orgid`, optional safe redirect, issue time, and expiry.
3. Frontend exchanges it through `POST /api/auth/session/exchange` with credentials enabled.
4. Backend atomically consumes code and sets an app session cookie with:
   - `HttpOnly`
   - `Secure` in production
   - `SameSite=Lax` for same-site deployments
   - `SameSite=None; Secure` only when a cross-site deployment is explicitly required
   - short, documented `Max-Age` from `APP_SESSION_TTL_SECONDS`
5. API guard validates cookie, `orgid` match, token availability, and origin policy for unsafe methods.
6. Unsafe cookie-authenticated routes must enforce origin/referer validation and may add CSRF token validation when deployment requires cross-site cookies.
7. Bearer/localStorage/sessionStorage app session fallback is out of V1 core.
8. Haravan access/refresh tokens are never returned to the frontend.

## Safe Redirect Rules

A safe redirect must:

- Begin with exactly one `/`.
- Be same-origin and relative.
- Not begin with `//`.
- Not contain raw or decoded backslashes or control characters.
- Not target `/install*`, `/oauth*`, or `/api/oauth*` before or after URL decoding.
- Not normalize through dot segments into `/install*`, `/oauth*`, or `/api/oauth*`.

Invalid redirect becomes `/dashboard`.

## Subscription Lifecycle

Subscription webhook may arrive before install.

1. Verify webhook HMAC first.
2. Resolve org/domain/subscription correlation keys.
3. Store `SubscriptionSnapshot` even if `AppInstall` does not exist yet.
4. During install, apply best matching snapshot by priority:
   1. trusted `orgid`
   2. normalized domain
   3. subscription id
   4. payload hash / received timestamp for audit only
5. Active paid subscription sets `status=active`, `plan=Pro`.
6. Canceled/inactive/expired subscription sets `plan=Free` and status `canceled`/`expired`, unless app is already `uninstalled`.
7. Merchant data is preserved; product-specific data deletion is not part of core V1.

## Webhook Lifecycle

### Registration

When `HRV_WEBHOOK_AUTO_SUBSCRIBE=true`, install must:

- Ensure install scope includes webhook capability (`wh_api` unless Haravan docs prove a different scope).
- Attempt registration/subscription for lifecycle topics.
- Persist registration status:
  - `not_configured`
  - `pending`
  - `registered`
  - `degraded`
  - `failed`
- Surface degraded/failed registration through protected readiness and app status.
- Provide manual checklist or ensure endpoint in later implementation if Haravan endpoint behavior differs by app type.

### Challenge

`GET /api/oauth/install/webhooks` handles only Haravan challenge verification.

- Require `hub.verify_token` and `hub.challenge`.
- Compare verify token against `HRV_WEBHOOK_VERIFY_TOKEN`, separate from POST HMAC `HRV_WEBHOOK_SECRET`.
- Return challenge as plain text.

### Delivery

`POST /api/oauth/install/webhooks` handles event delivery.

1. Enforce method, content type, and body limit before parsing reducers.
2. Capture raw body.
3. Verify HMAC with accepted Haravan headers.
4. Normalize topic.
5. Resolve payload/domain identity.
6. Cross-check query/header `orgid` compatibility input against resolved identity.
7. Insert idempotent `WebhookEvent` before reducer.
8. Process inline in V1 from persisted event.
9. Mark processed/failed/ignored with retry metadata for a future sweeper/queue recipe.

## Uninstall Lifecycle

Uninstall reducer must:

1. Resolve org/domain identity and cross-check compatibility `orgid`.
2. Acquire lifecycle lock or increment generation in a transaction.
3. Clear Redis install/session/domain/subscription/token-refresh keys for the org.
4. Null all encrypted access/refresh token columns and metadata in DB.
5. Set `status=uninstalled`, `uninstalledAt`, `dataPreserved=true`.
6. Tombstone known domains so future webhook/domain resolution cannot revive an old install silently.
7. Preserve merchant data by default.
8. Ignore late token refresh writes by generation check.

## Token Refresh Lifecycle

Token refresh is allowed only when install is not blocked.

- Use owner-token Redis lock with compare-and-delete release.
- Wait bounded time for concurrent refresh.
- Re-read install status/generation after network exchange.
- Conditionally persist new tokens only if generation/status still match.
- Write paths require fresh token; stale Pro DB-first read mode is not a Haravan-write shortcut.
- `invalid_grant` marks token state and usually sets `needs_reinstall` unless product policy explicitly allows read-only DB mode.

## Core Invariants

- No `jwt.decode()` identity trust.
- No direct no-HMAC session.
- No JS-readable app session token in core.
- No Redis `KEYS` in production paths.
- No non-owner lock release.
- No random webhook idempotency fallback.
- No webhook state mutation before HMAC and org/domain cross-check.
- No public readiness details.
