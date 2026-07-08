# Sapo Production Deploy

## Architecture

```text
Cloudflare Pages (client SPA)
  ├─ /api/* → proxy → NestJS server (DO + PM2)
  └─ /storefront/* → proxy → NestJS server

NestJS Server (DO droplet)
  ├─ PROCESS_ROLE=api → HTTP + webhook receiver
  └─ PROCESS_ROLE=worker → queue worker

PostgreSQL (Supabase) — app data
Redis — sessions, locks, rate limits
Cloudflare R2 — media uploads (f1genz-sapo-images)
```

## Prerequisites

1. **Supabase** PostgreSQL database (or any Postgres)
2. **Redis** instance (Upstash, Redis Cloud, or self-hosted)
3. **Cloudflare R2** bucket `f1genz-sapo-images` + custom domain
4. **Cloudflare Pages** project for client
5. **DigitalOcean** droplet (Ubuntu 22.04+) with Node.js 20+
6. **Sapo Partner** app registered at `developers.sapo.vn`

## Sapo Partner Dashboard

Register with these URLs:
- App URL: `https://reviews-sapo.f1genz.dev`
- Install callback: `https://api-sapo-reviews.f1genz.dev/api/oauth/install/callback`
- Login callback: `https://api-sapo-reviews.f1genz.dev/api/oauth/install/login/callback`
- Webhook URL: `https://api-sapo-reviews.f1genz.dev/api/oauth/install/webhooks`
- Scopes: `read_products write_products read_orders write_orders read_customers write_customers read_script_tags write_script_tags read_themes write_themes`

## Server Deploy (DigitalOcean + PM2)

```bash
# On the DO droplet
git clone <repo-url> /opt/f1genz-sapo
cd /opt/f1genz-sapo

# Install
npm --prefix server ci
npm --prefix server run db:generate
npm --prefix server run build

# Run migrations (first deploy only)
npx --prefix server prisma migrate deploy

# Start
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup

# Reload after deploy
git pull
npm --prefix server ci
npm --prefix server run db:generate
npm --prefix server run build
npx --prefix server prisma migrate deploy
pm2 reload ecosystem.config.cjs --update-env
```

## Client Deploy (Cloudflare Pages)

```bash
npm --prefix client ci
npm --prefix client run build
# Deploy client/dist via Cloudflare Pages dashboard or wrangler
```

Cloudflare Pages env vars:
- `BACKEND_URL=https://api-sapo-reviews.f1genz.dev`

Build settings:
- Build command: `npm --prefix client run build`
- Output directory: `client/dist`

## Worker Deploy (Cloudflare R2)

```bash
cd worker
npm ci
npx wrangler secret put UPLOAD_SECRET
npx wrangler deploy
```

## Env Checklist

All required env vars (see `server/.env.example`):
- `SAPO_CLIENT_ID`, `SAPO_CLIENT_SECRET`, `SAPO_SCOPE`
- `SAPO_INSTALL_CALLBACK_URL`, `SAPO_LOGIN_CALLBACK_URL`
- `SAPO_WEBHOOK_SECRET`
- `APP_SESSION_SECRET`
- `DATABASE_URL`, `DIRECT_URL`, `DATA_ENCRYPTION_KEY`
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`
- `R2_WORKER_URL`, `R2_UPLOAD_SECRET`, `R2_PUBLIC_DOMAIN`
- `API_BASE_URL`, `FRONTEND_URL`, `CORS_ALLOWED_ORIGINS`
- `READINESS_TOKEN`, `BUILD_SHA`

## Health Checks

```bash
# Liveness (public)
curl https://api-sapo-reviews.f1genz.dev/livez

# Readiness (protected)
curl -H "Authorization: Bearer $READINESS_TOKEN" https://api-sapo-reviews.f1genz.dev/readyz
```

## Pre-Launch Verification

```bash
npm run verify
```

Manual checks:
1. Install on Sapo sandbox via OAuth
2. Admin SPA loads embedded, reviews/Q&A CRUD works
3. Storefront widget renders on theme
4. Webhooks verified, idempotent
5. Media upload via worker succeeds
6. `grep -ri "haravan\|orgid" server/src client/src` → zero hits

## Rollback

- Client: roll back Cloudflare Pages deployment
- Server: `pm2 reload` previous version if build fails
- Worker: `wrangler rollback`
- If migrations ran, prefer forward fix; do not manually delete lifecycle rows
