# Phase 05 — Sapo OAuth, Identity & Session

**Goal:** Complete install + login OAuth, store-domain identity, install-session storage, session tokens, token refresh.
**Depends on:** 01, 03, 04

## Red Team Hardening (S2) — MUST DO
- **[F7 High] Bind store identity from an AUTHENTICATED source only.** After id_token removal there is no signed
  identity. Derive `store_domain` from the **token-exchange response body** (server-to-server, TLS) or an immediate
  `GET shop/account` made **with the newly issued token**, and assert it against the OAuth `state` you stored.
  **Forbid** trusting the redirect `store`/`shop` query param for identity binding (else cross-tenant takeover:
  attacker OAuths their store, presents `store=victim`, token persists under victim key). Make this a Phase 01 blocking fact.
- **[F8 High] Launch-signature replay guard is MANDATORY, not "if provided."** The reference accepts the launch
  HMAC unconditionally when no timestamp is present (`haravan.service.ts:996`), then mints a session (`:1007`).
  Require a fresh timestamp/nonce in the Sapo launch signature; if Sapo does not sign one, do **not** mint a
  session from a bare signed URL — require the interactive OAuth/SSO leg first.
- **[F11 High] No refresh token → define background-auth failure.** Sapo token lifetime is a Phase 01 blocking
  fact. On a background 401 (webhook/catalog/order jobs call `resolveAccessToken` with no human), mark the session
  `needs_reauth`, **pause that store's queues** (don't burn 8 BullMQ retries into the DLQ per job), surface a
  re-auth prompt. Do NOT return a stale expired token (the reference Pro path does, `haravan.service.ts:942-946`).
- **[F13 High] Model multi-/custom-domain stores.** The reference matches any of `shop_domain`, orgsub-derived, or
  `shop_domains[]` (`appMatchesShop`, `haravan.service.ts:589`,`:1417`,`:1894`). Keep `store_domain` canonical but
  persist a `known_domains[]` set + a `domain→canonical` reverse index, populated at install and on shop-update.
  Remove the "reverse index only if custom domains differ" optionality below.
- **[F14 High] Decouple feature-unlock from `isProPlan()`.** Do NOT hardcode `isProPlan()=true` — it also gates
  session TTL (`getInstallTtlSeconds :546`) and inactive-status enforcement (`hasInstalledAppSession :802`,
  `resolveAccessToken :873`). Keep those driven by real install/token state; add a separate `featuresUnlocked=true`
  flag for v1. **Drop the 15-day trial** field (contradicts free-first D5).
- **[F15 High] Single Sapo auth flow, not the Haravan OpenID dual flow.** Do NOT port `loginApp`/`getAuthEntry`/
  `processLoginCallback` + the install-vs-login-vs-ready tri-state unless Phase 01 proves Sapo exposes a separate
  admin-SSO handshake. A plain store-domain OAuth app needs one install/auth per store.
- **[F18 Med] `setAuthCookies` MUST set `HttpOnly`; do NOT echo `session_token` in the redirect URL.** The
  reference cookies omit HttpOnly (`haravan.service.ts:508`) and put the token in the URL (`:502`) — XSS/log leak.
  If the SPA must read the token, keep it in memory via the embedded SDK/one-time exchange, not a readable cookie + URL.
- **[F19 Med] Require a DISTINCT `APP_SESSION_SECRET`.** The reference falls back to the OAuth client secret
  (`haravan.service.ts:459`, `.env.example:39` blank) — one leak forges JWTs + launch HMAC + webhook HMAC. Fail
  startup if `APP_SESSION_SECRET` unset; use a separate webhook secret (see Phase 06).

## Reference (auth half of `haravan.service.ts`)

- Install flow `installApp`, login flow `loginApp`/`getAuthEntry`/`processLoginCallback`, `refreshToken`,
  `resolveAccessToken`, `createSessionToken`, `setAuthCookies`, `buildFrontendUrl`, `verifyHmac`+`buildHmacMessage`,
  Redis install store (`saveInstallSession`, `getInstallSession`, `shopDomain` mapping), OAuth state
  (`createOAuthState`/`consumeOAuthState`), trial/plan fields in `RedisInstallData`.
- `haravan.controller.ts` route surface `/oauth/install/{login,login/entry,login/verify-hmac,login/callback,grandservice}`.

## Build (new project `src/platform/sapo/`)

- `sapo-auth.service.ts`:
  - Build authorize URL (install + login) per Sapo ‹VERIFY›; CSRF `state` in Redis (port OAuth-state TTL logic).
  - `POST` code→token exchange; persist `SapoInstallData { access_token, refresh_token?, token_expires_at?,
    store_domain, status, plan, expires_at, installed_at, ... }` in Redis keyed by **store domain**.
  - **Install HMAC/signature verify** to Sapo spec ‹VERIFY› (own `buildSapoSignatureMessage`; do NOT reuse
    Haravan unsorted builder). Timing-safe compare; timestamp freshness if provided.
  - `resolveAccessToken(storeDomain)` with refresh-window + Redis refresh-lock (port logic); re-auth path if no refresh token.
  - `createSessionToken(storeDomain)` (HS256 JWT, `sub=storeDomain`) — port verbatim; `setAuthCookies` (SameSite=None; Secure).
  - Post-install automation hook (register webhooks P06, sync orders P08, write storefront config P13, enqueue catalog P08).
- `sapo.controller.ts`: routes mirroring reference contract, returning `{ url, storeDomain, sessionToken }`.
- `sapo.module.ts`: provide auth + api services; import Redis/Database/Config.

## Steps

1. Model `SapoInstallData` (drop orgid/orgsub; add `store_domain`).
2. Implement authorize-URL builders + scope list (Phase 01 scopes).
3. Implement token exchange + install-session persistence + **`known_domains[]` + `domain→canonical` reverse index**
   (always — per F13; populated at install and shop-update, covers custom domains).
4. Implement Sapo signature verify + tests.
5. Implement session issuance + cookies + refresh + re-auth.
6. Wire controller routes; leave post-install automation calling P06/P08/P13 (stubs until built).

## Contracts / notes

- <!-- Red Team S2: F14 supersedes S1 free-first framing. -->
  **v1 feature-unlock (D5, revised S2):** model `SapoInstallData` with `{ access_token, refresh_token?,
  token_expires_at?, store_domain, known_domains[], status, installed_at, uninstalled_at? }`. **Drop**
  `plan`/`quota_*`/`expires_at` trial field for v1 (revisit when Phase 07 undefers). `isProPlan()` is **not**
  hardcoded true — it returns real state from install/token status; a separate `featuresUnlocked=true` v1 flag
  gates features. Session TTL + inactive-status enforcement remain fully in force.
- If Sapo has no `id_token`, delete all JWKS/id_token verification from the reference — identity comes from the
  token-exchange response / an immediate authenticated `GET shop/account` (F7), **never** the redirect query param.

## Tests / validation

- Unit: authorize URL builder, token exchange (mock), signature verify (valid/tampered/missing/expired),
  session issue/verify, refresh + lock contention.
- Sandbox: real install on dev store → token stored, session issued, cookies set; `getShop` succeeds via P04.

## Acceptance

- End-to-end install + login on sandbox; `resolveAccessToken` returns a working token; identity = store domain throughout.

## Risks

- Sapo signature construction differs from Haravan → isolate + test heavily; a wrong message string silently fails installs.
- No `offline_access`/refresh → design admin re-login UX (P16) instead of silent refresh.
