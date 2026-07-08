# Security Checklist

Use this checklist before deploying or extending a Haravan app built from this base.

## Secrets and env

- [ ] `.env` is not committed.
- [ ] `server/.env.example` contains placeholders only.
- [ ] `NODE_ENV=production` is set in production.
- [ ] `APP_SESSION_SECRET` is at least 32 bytes and separate from `HRV_CLIENT_SECRET`.
- [ ] `DATA_ENCRYPTION_KEY` decodes to exactly 32 bytes.
- [ ] `HRV_WEBHOOK_SECRET` is set and not equal to public/client values.
- [ ] `HRV_WEBHOOK_VERIFY_TOKEN` is set and separate from `HRV_WEBHOOK_SECRET`.
- [ ] `READINESS_TOKEN` is set and private.
- [ ] Redis/PostgreSQL credentials are server-side only.

## OAuth and OIDC

- [ ] OAuth state is random, hashed at rest, TTL-bound, and atomically consumed.
- [ ] Nonce is per flow and verified against `id_token`.
- [ ] OIDC issuer/JWKS/discovery URLs are configured.
- [ ] `id_token` is verified with JWKS before trusting `orgid`.
- [ ] No `jwt.decode()` identity path exists.
- [ ] Missing HMAC starts OAuth SSO.
- [ ] Invalid/stale HMAC fails closed.
- [ ] No direct no-HMAC session flag exists.

## Sessions

- [ ] Backend returns only one-time handoff code after OAuth/HMAC success.
- [ ] `POST /api/auth/session/exchange` atomically consumes handoff code.
- [ ] App session cookie is `HttpOnly`.
- [ ] Production cookie is `Secure`.
- [ ] `SameSite` policy matches deployment shape.
- [ ] Frontend does not store app auth token in localStorage/sessionStorage/URL.
- [ ] Unsafe cookie-authenticated methods enforce origin/referer validation.

## Webhooks

- [ ] Webhook POST captures raw body.
- [ ] HMAC uses `HRV_WEBHOOK_SECRET`, not client secret.
- [ ] Body size and content type are enforced before reducer logic.
- [ ] Query/header orgid is compatibility input only.
- [ ] Payload/domain identity is cross-checked before mutation.
- [ ] Event is inserted idempotently before reducer.
- [ ] Processed duplicate delivery does not rerun reducer; failed/received retries can be processed again.
- [ ] Registration failure is visible as degraded/failed state.

## Token storage and refresh

- [ ] Haravan access/refresh tokens are encrypted at rest.
- [ ] Tokens are never returned to frontend.
- [ ] Refresh lock uses owner-token compare/delete release.
- [ ] Refresh writes include lifecycle generation/status condition.
- [ ] `invalid_grant` policy cannot silently keep writing to Haravan.

## Uninstall

- [ ] Uninstall clears Redis install/session/domain/token-refresh state.
- [ ] Uninstall nulls all encrypted token DB columns.
- [ ] Uninstall increments lifecycle generation and token version.
- [ ] Active domain mappings are tombstoned.
- [ ] Merchant data preservation/deletion policy is explicit for product data.

## Public ingress

- [ ] OAuth/HMAC/session/webhook endpoints have rate limits.
- [ ] `/livez` is public and minimal only.
- [ ] `/readyz` requires `Authorization: Bearer $READINESS_TOKEN`.
- [ ] CORS origins are explicit HTTPS origins in production.
- [ ] Body limits are finite.

## Static checks

Run before handoff:

```bash
npm run verify
npm run scan:anti-patterns
```

The anti-pattern scan checks for weak source-app patterns: `jwt.decode()`, Redis `KEYS`, non-atomic state/handoff consume, browser session-token storage, direct no-HMAC session flags, random webhook idempotency, hardcoded proxy fallback domains, and unsafe production deploy script patterns.
