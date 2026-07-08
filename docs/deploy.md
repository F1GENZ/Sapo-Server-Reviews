# Deploy Guide

This guide covers deployment shape for the V1 base. Use real secrets only in deployment environment variables, never in repository files.

## Deployment options

Recommended V1 shape:

```text
Cloudflare Pages client -> /api proxy -> NestJS server -> PostgreSQL + Redis
```

Alternative:

```text
Single origin reverse proxy -> client static assets + NestJS /api -> PostgreSQL + Redis
```

## Production env checklist

Server:

- `NODE_ENV=production`
- `PORT`
- `FRONTEND_URL`
- `API_BASE_URL`
- `CORS_ALLOWED_ORIGINS`
- `TRUST_PROXY`
- `REQUEST_BODY_LIMIT`
- `WEBHOOK_BODY_LIMIT`
- Haravan OAuth URLs/scopes/callbacks
- OIDC issuer and discovery/JWKS URL
- webhook URL/secret/auto-subscribe flag
- app session secret/TTL/cookie settings
- Redis config
- PostgreSQL `DATABASE_URL` and `DIRECT_URL`
- `DATA_ENCRYPTION_KEY`
- ingress rate limit variables
- `READINESS_TOKEN`

Client:

- `VITE_API_BASE_URL=/api` for Cloudflare Pages same-origin proxy, or full API origin only when CORS/cookie policy is intentionally configured.

Cloudflare Pages:

- `BACKEND_URL=https://api.example.com`

## Server deploy with PM2

See `recipes/pm2-deploy/README.md`.

Summary:

```bash
npm --prefix server ci
npm --prefix server run db:generate
npm --prefix server run build
npm --prefix server run db:migrate
pm2 reload haravan-app-base-api --update-env
```

For first deploy, start with:

```bash
pm2 start server/dist/main.js --name haravan-app-base-api --time
pm2 save
```

Do not use `pm2 --watch` in production.

## Cloudflare Pages client deploy

See `recipes/cloudflare-pages-proxy/README.md`.

Build command:

```bash
npm --prefix client ci
npm --prefix client run build
```

Output directory:

```text
client/dist
```

Function path:

```text
client/functions/api/[[path]].js
```

## Health checks

Liveness, safe public check:

```bash
curl -fsS https://api.example.com/livez
```

Readiness, protected check:

```bash
curl -fsS -H "Authorization: Bearer $READINESS_TOKEN" https://api.example.com/readyz
```

Do not expose readiness output publicly.

## Haravan production checklist

- Login callback points to `https://api.example.com/api/oauth/install/login/callback`.
- Install callback points to `https://api.example.com/api/oauth/install/grandservice`.
- Webhook URL points to `https://api.example.com/api/oauth/install/webhooks`.
- Webhook capability/scope is enabled for the app.
- Sandbox install succeeds.
- Webhook challenge succeeds.
- Subscription/update/uninstall delivery creates one `WebhookEvent` per delivery.
- Uninstall clears token material and tombstones domains.

## Verification before release

From workspace root:

```bash
npm run verify
```

If real Haravan callback/webhook behavior cannot be exercised locally, record that as manual verification pending and keep webhook registration degraded visibility enabled.

## Rollback

- If client deploy fails, roll back Cloudflare Pages to previous deployment.
- If server build fails, do not reload PM2.
- If server reload fails before migrations, reload previous PM2 version.
- If migrations ran, prefer forward fix or DB restore. Do not manually delete lifecycle rows to recover.
