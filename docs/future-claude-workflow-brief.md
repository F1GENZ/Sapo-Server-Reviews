# Future Claude Workflow Brief

This brief is for a later skill/workflow that generates real Haravan apps from this base. It is not a generator implementation.

## Questions to ask before generating an app

1. App name and target repository path.
2. Haravan app type and callback domains.
3. Required product domain modules.
4. Billing/subscription policy.
5. Which recipes are needed now.
6. Deployment target: Cloudflare Pages + VPS API, single origin, or other.
7. Data retention policy after uninstall.
8. Whether real Haravan sandbox verification is available.

## Files to inspect first

- `docs/lifecycle.md`
- `docs/oauth-install-login.md`
- `docs/webhook-subscription-uninstall.md`
- `docs/env-contract.md`
- `docs/security-checklist.md`
- `docs/recipes.md`
- `server/src/haravan/*`
- `server/test/lifecycle.test.ts`
- `client/src/routes/*`

## Generation boundaries

A future workflow may copy this base, rename packages, and add app-specific modules. It must not weaken:

- OIDC verification
- atomic state/handoff consume
- HttpOnly cookie handoff
- webhook HMAC/raw body verification
- org/domain identity cross-check
- uninstall token clearing and lifecycle generation guard
- public ingress rate limits
- protected readiness

## Recipe routing

- Cloudflare deploy requested: include Cloudflare proxy recipe.
- VPS/PM2 deploy requested: include PM2 recipe.
- Slow webhook or background jobs: add queue worker recipe.
- Merchant content builder: add page-builder recipe.
- Resource settings on Haravan objects: add metafields recipe.
- File/media upload: add R2 uploader recipe.
- Domain-specific abuse controls: add advanced rate-limit recipe.
- Operator retry/visibility: add ops dashboard only after queue/worker exists.

## Verification gate for generated apps

Run in generated repo:

```bash
npm run verify
```

Then run real sandbox checks for OAuth install, webhook challenge, webhook POST delivery, subscription update, and uninstall if credentials are available.
