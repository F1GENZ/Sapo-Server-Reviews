# Getting Started — F1GENZ Review Sapo

## Prerequisites

- Node.js 20+
- PostgreSQL (local or Supabase)
- Redis (local or Upstash)
- Sapo Partner account + app registered at `developers.sapo.vn`
- Sapo dev store (sandbox) — `your-store.mysapo.net`

## Local Setup

```bash
git clone <repo-url>
cd f1genz-review-sapo

# Server
cp server/.env.example server/.env
# Edit server/.env with your Sapo app credentials

npm --prefix server ci
npm --prefix server run db:generate
npx --prefix server prisma migrate dev

# Client
npm --prefix client ci
npm --prefix client run dev  # → http://localhost:5173

# Server (separate terminal)
npm --prefix server run dev  # → http://localhost:3000
```

## Sapo Sandbox Configuration

1. Register app at Sapo Partner dashboard
2. Set callback URLs to point to your local or ngrok URL
3. Copy `SAPO_CLIENT_ID` and `SAPO_CLIENT_SECRET` to `.env`

Required OAuth scopes:
```
read_products write_products read_orders write_orders
read_customers write_customers read_script_tags write_script_tags
read_themes write_themes
```

## Verify

```bash
npm run verify
```

## Architecture

- **Server**: NestJS (Express) + Prisma + Redis + ioredis
- **Client**: Vite + React 18 + antd + react-query + react-router 6
- **Worker**: Cloudflare Worker (R2 image uploads)
- **Deploy**: PM2 + Cloudflare Pages + DigitalOcean

## Key Differences from Haravan

| Haravan | Sapo |
|---|---|
| OpenID Connect + id_token + JWKS | OAuth2 authorization code only |
| `Authorization: Bearer` | `X-Sapo-Access-Token` |
| Central API `apis.haravan.com` | Per-store `{store}.mysapo.net/admin` |
| `orgid` identity | `storeDomain` identity |
| Refresh token (24h) | Permanent token |
| Unsorted HMAC | Sorted A-Z HMAC |
