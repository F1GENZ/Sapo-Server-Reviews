# OAuth Install and Login

This document explains the Haravan app launch, OAuth login/install, OIDC verification, and app-session handoff flow implemented by the base.

## Routes

| Route | Purpose |
|---|---|
| `GET /api/oauth/install/login` | Start OAuth SSO login. |
| `GET /api/oauth/install/login/verify-hmac` | Verify signed Haravan Admin launch query. |
| `GET /api/oauth/install/login/callback` | Login callback. Consumes login state and creates handoff for existing install. |
| `GET /api/oauth/install/grandservice` | Install callback. Persists install and creates handoff. |
| `POST /api/auth/session/exchange` | Atomically consumes one-time handoff code and sets HttpOnly app cookie. |
| `POST /api/auth/logout` | Clears app session cookie. |
| `GET /api/app/session` | Protected session probe used by the frontend dashboard. |

## Admin launch rules

Haravan Admin launch may include `shop`, `orgid`, `timestamp`, and `hmac`.

- Missing HMAC starts OAuth SSO.
- Present HMAC requires finite timestamp and raw-query verification.
- Invalid, stale, or malformed HMAC fails closed.
- V1 never mints a direct session from public `shop + orgid`.
- A mixed OAuth `code` plus launch `hmac` callback is rejected as ambiguous by the client.

## OAuth state and nonce

Each login/install start creates:

- random `state`
- random per-flow `nonce`
- Redis state record under hashed key
- optional `orgid`
- optional safe redirect path

Callback consumes state atomically with Redis `GETDEL` or Lua fallback. A reused state fails.

## OIDC verification

The server verifies `id_token` with JWKS before trusting identity:

- signature must verify against configured JWKS/discovery
- `iss` must match `HRV_ISSUER_URL`
- `aud` must contain `HRV_CLIENT_ID`
- `exp`, `nbf`, and `iat` must be valid within skew
- nonce must match the consumed OAuth state
- `orgid` is read only from verified claims

Do not use `jwt.decode()` as identity proof.

## Install callback behavior

Install callback:

1. consumes install state atomically
2. exchanges code with Haravan token endpoint
3. verifies `id_token`
4. persists `Shop` and `AppInstall`
5. encrypts access/refresh tokens server-side
6. applies matching subscription snapshot when present
7. saves active domain mappings
8. attempts webhook registration when enabled
9. creates one-time handoff code

The response contains a handoff code, not Haravan tokens.

## Login callback behavior

Login callback:

1. consumes login state atomically
2. exchanges code with Haravan token endpoint
3. verifies `id_token`
4. checks existing install status
5. starts install if missing or blocked
6. resolves a fresh server-side access token when install is usable
7. creates one-time handoff code

Blocked statuses: `canceled`, `expired`, `needs_reinstall`, `declined`, `uninstalled`.

## Session handoff

The handoff code is short-lived and one-time:

```text
Backend OAuth success -> handoff code -> POST /api/auth/session/exchange -> HttpOnly cookie
```

Cookie rules:

- `HttpOnly`
- `Secure` in production or cross-site deployment
- `SameSite=Lax` for same-site deployment
- `SameSite=None; Secure` only when cross-site cookies are explicitly required
- app session TTL from `APP_SESSION_TTL_SECONDS`

Frontend stores only `orgid` as UI context. It is never auth proof.

## Safe redirects

Safe redirect must:

- start with exactly one `/`
- be same-origin relative
- not start with `//`
- not contain raw or decoded backslashes/control chars
- not target `/install*`, `/oauth*`, or `/api/oauth*`
- not normalize via dot segments into auth routes

Invalid redirect becomes `/dashboard`.

## Tests covering this flow

`server/test/lifecycle.test.ts` covers:

- atomic OAuth state consume
- atomic session handoff consume
- no-HMAC SSO fallback
- invalid HMAC fail-closed behavior
- raw query HMAC verification
- OIDC signature/audience/expiry/nonce checks
- install callback orgid mismatch rejection
- safe redirect normalization bypasses
