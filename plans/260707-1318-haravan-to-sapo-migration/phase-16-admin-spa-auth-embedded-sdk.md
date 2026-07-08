# Phase 16 — Admin SPA Auth & Embedded SDK

**Goal:** Install/login UX, session handling, and Sapo Embedded App SDK integration for the admin iframe.
**Depends on:** 05, 15

## Red Team Hardening (S2) — MUST DO
- **[F6 Critical] SDK + iframe-cookie is a BLOCKING two-cell matrix.** Do NOT enter Phase 16 with either
  unresolved. Phase 01 must answer: (a) does Sapo have an Embedded App SDK with a session-token API?
  (b) do `SameSite=None` cookies survive Sapo's admin iframe (3rd-party cookie storage partitioning)?
  Decision matrix:
    - {SDK yes} → fetch fresh session token via SDK on every request; cookie not required.
    - {SDK no, cookie yes} → cookie-based session (must be `HttpOnly` per F18).
    - {SDK no, cookie no} → top-level break-out redirect (open app in a new tab) OR proxy session via
      backend-set cookie on a shared subdomain. **"token-in-URL" is NOT a fallback** — it dies on reload.
- **[F13 High] Multi-domain routing.** Client identity param accepts the store's canonical `store_domain`;
  backend accepts any of install `known_domains[]` (F13/Phase 05) and maps to canonical.
- **[F15 High] Single Sapo auth flow — drop tri-state.** Do NOT port `getAuthEntry` "install vs login vs ready"
  branching unless Phase 01 proves a separate admin-SSO handshake exists. Simplify to `installed?` → app UI,
  `not installed?` → install redirect.
- **[F18 Med] `HttpOnly` cookie + no token-in-URL.** Client should NOT read the JWT from `document.cookie`;
  backend sets `HttpOnly` and includes it on API calls automatically. If the SDK path is used, keep the token
  in memory only, never in URL / storage that JS in the same origin can read across pages.

## Reference

- `client/src/common/{authFlow.js, AuthStorage.js, AuthService.js}` — orgid/session, `AUTH_CALLBACK_PARAMS`
  (incl. OpenID `id_token`), redirect sanitize, post-auth redirect.
- `client/src/pages/auth/{login/index.jsx, grandservice/index.jsx}` — login + install callback pages.
- Backend contract (P05): `/oauth/install/{login, login/entry, login/callback, grandservice, login/verify-hmac}`
  returning `{ url, storeDomain, sessionToken }`.

## Build (new project `client/src/`)

- Port `authFlow.js` — **remove OpenID-only params** (`id_token`) from `AUTH_CALLBACK_PARAMS` (Sapo has no id_token);
  keep `session_token`, `code`, `state`. Identity param = `store` via `identity.js`.
- Port `AuthStorage.js` (store `session_token` + store domain), `AuthService.js` (call Sapo auth routes).
- `common/embedded.js` (NEW) — Sapo Embedded App SDK abstraction ‹VERIFY›: iframe launch params, session-token
  retrieval (if provided), host-app navigation. Isolate so an SDK change is one file.
- Port `pages/auth/login` + `pages/auth/grandservice` (install callback) → point at Sapo routes; store-domain identity.

## Steps

1. Port auth flow; strip id_token handling; keep session-token exchange + cookie/redirect contract.
2. Implement `embedded.js` against Sapo SDK (launch, identity, navigation).
3. Port auth pages; wire to backend Sapo routes; handle install→login→ready states (mirror `getAuthEntry`).
4. Handle third-party-cookie/iframe constraints (SameSite=None; Secure cookies from P05).

## Contracts / notes

- Backend returns store-domain + sessionToken; client stores + attaches on every request (P15 axios).
- Preserve the reference's "install vs login vs ready" branching so uninstalled/expired stores redirect to install.

## Tests / validation

- Build + smoke green.
- Sandbox: open app from Sapo admin → embedded loads, identity resolves, session persists across reloads;
  fresh store → install flow; installed store → login/SSO → ready.

## Acceptance

- Admin authenticates and loads embedded in Sapo admin; session survives reload; install/login/ready states correct.

## Risks

- Sapo SDK API unknown until Phase 1 → keep isolated in `embedded.js`.
- Iframe cookie constraints → verify SameSite=None;Secure works in Sapo admin context; fall back to token-in-URL if needed.
