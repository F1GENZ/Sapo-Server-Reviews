# Anti-Patterns

These are weak patterns observed in source apps or common Haravan app implementations. The base should prevent them.

## Identity and OAuth

### `jwt.decode()` identity trust

Do not trust decoded JWT payloads. Always verify `id_token` signature and claims through OIDC/JWKS.

Bad:

```ts
const claims = jwt.decode(idToken);
```

Required:

```ts
const claims = await oidcVerifier.verifyIdToken(idToken, expectedNonce);
```

### Non-atomic OAuth state consume

Do not read state then delete it later. Concurrent callbacks can replay.

Bad:

```ts
const state = await redis.get(key);
await redis.del(key);
```

Required: `GETDEL` or Lua compare/delete through `RedisService.getDel`.

### Static nonce

Nonce must be per OAuth flow, stored with state, and verified against `id_token`.

## Sessions

### Direct no-HMAC session

Do not mint app sessions from unsigned `shop + orgid` launch params. Missing HMAC starts OAuth SSO; invalid HMAC fails closed.

### JS-readable session token

Do not put app sessions in URL, hash, localStorage, or sessionStorage. Use one-time handoff code and HttpOnly cookie.

## Webhooks

### Parsed-body HMAC

Webhook HMAC must verify raw request body bytes, not parsed JSON.

### Header/query orgid trust

Header/query orgid is compatibility input only. Cross-check it against signed payload/domain mapping before mutation.

### Random idempotency fallback

Do not add random bytes when provider event id is missing. Use deterministic topic + resolved org/domain + payload hash.

## Redis and locks

### Redis `KEYS`

Do not use Redis `KEYS` in production paths. Use deterministic indexes, DB lookups, or SCAN for operational cleanup.

### Non-owner lock release

Do not release a lock with unconditional `del`. Use owner token compare/delete.

## Deploy and proxy

### Hardcoded backend fallback

Cloudflare proxy must require `BACKEND_URL`; it must not fall back to an app-specific production URL.

### `npm install` in production deploy scripts

Use `npm ci` for reproducible deploys.

### `pm2 --watch` in production

Use explicit build/reload. Watch mode can restart during file writes and hide deploy ordering bugs.

## Static scan

Run:

```bash
npm run scan:anti-patterns
```

The scanner is intentionally conservative. If it flags a false positive, prefer rewriting the code/comment so the invariant remains obvious rather than weakening the scan.
