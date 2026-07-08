# Sapo OAuth2 Authentication Flow

## Overview

F1GENZ Review Sapo uses Sapo's OAuth2 authorization code flow. Unlike Haravan's OpenID Connect hybrid flow, Sapo has:
- No `id_token`, no JWKS, no OpenID
- Permanent access tokens (no refresh)
- HMAC signature verification on install callback (params sorted A-Z, SHA256, base64)

## Flow

```
1. Merchant clicks "Install" in Sapo App Store
   → Redirect to https://{store}.mysapo.net/admin/oauth/authorize
     ?client_id={SAPO_CLIENT_ID}
     &scope={scopes}
     &redirect_uri={callback_url}
     &state={random_state}

2. Sapo redirects back with code + hmac + state + timestamp
   → GET /api/oauth/install/callback?code=xxx&hmac=xxx&state=xxx&timestamp=xxx

3. Server verifies HMAC (sorted A-Z, SHA256, base64)
   → Exchanges code for access_token
     POST https://{store}/admin/oauth/access_token
     { client_id, client_secret, code }

4. Server calls GET /admin/shop.json to verify store identity
   → Encrypts access_token, persists install in DB
   → Registers webhooks, writes storefront config metafield
   → Creates session handoff → HttpOnly cookie

5. Frontend loads with session cookie → no token in browser
```

## HMAC Verification

```typescript
// 1. Parse query params, remove 'hmac'
// 2. Sort remaining keys A-Z (localeCompare)
// 3. Join as key=value&key=value
// 4. HMAC-SHA256(message, SAPO_CLIENT_SECRET)
// 5. Compare with received hmac (timing-safe, hex)
```

**Critical:** HMAC is sorted A-Z. Sapo differs from Haravan which uses unsorted/raw-order params.

## Token Management

- Sapo access tokens are **permanent** (no expiry, no refresh)
- Stored encrypted server-side (AES-GCM)
- Resolved per-call via `resolveAccessToken(storeDomain)`
- On 401 from Sapo API → mark install as `needs_reinstall`
- Never expose tokens to browser/storefront JavaScript

## Session

- One-time handoff code after OAuth callback
- Exchange for HttpOnly session cookie (`SameSite=None; Secure; HttpOnly`)
- Session JWT signed with `APP_SESSION_SECRET` (must be distinct from client/webhook secrets)
- Guard validates session on admin API routes
