# Getting Started

This starter is the reusable base for Haravan apps that need secure OAuth install/login, HttpOnly app sessions, webhook lifecycle handling, subscription state, uninstall cleanup, Redis runtime state, PostgreSQL durable state, and a minimal React admin shell.

## What this base is

- `server/`: NestJS lifecycle API with Prisma and Redis.
- `client/`: React + Vite lifecycle shell.
- `recipes/`: optional deployment/product recipes, mostly docs-only backlog.
- `scripts/`: local verification and anti-pattern scans.

## What this base is not

- Not a Haravan theme workflow.
- Not a CLI generator yet.
- Not a full app product UI.
- Not a page builder, R2 uploader, metafields dashboard, or ops dashboard by default.

## Prerequisites

- Node.js 18.18+
- PostgreSQL for durable state
- Redis for OAuth/session/runtime state
- Haravan app credentials and callback URLs

## First local setup

Install dependencies:

```bash
npm --prefix server install
npm --prefix client install
```

Create a private env file from the placeholder example:

```bash
cp server/.env.example server/.env
```

Fill `server/.env` with local or sandbox values. Never commit `.env`.

Generate Prisma client and apply migrations:

```bash
npm --prefix server run db:generate
npm --prefix server run db:migrate
```

Run the server and client in two terminals:

```bash
npm --prefix server run dev
npm --prefix client run dev
```

Open the client at `http://localhost:5173`.

## Haravan app callback URLs

Configure Haravan app settings to point at the API server:

```text
Login callback:   http://localhost:3333/api/oauth/install/login/callback
Install callback: http://localhost:3333/api/oauth/install/grandservice
Webhook URL:      http://localhost:3333/api/oauth/install/webhooks
```

For production, use HTTPS URLs from `FRONTEND_URL` and `API_BASE_URL`.

## Lifecycle smoke flow

1. Open the app from Haravan Admin or visit `/install/login`.
2. If launch has no HMAC, the frontend starts OAuth SSO.
3. OAuth login/install completes on the server.
4. Server verifies OIDC/JWKS and creates a one-time handoff code.
5. Frontend exchanges the handoff code for a HttpOnly cookie.
6. `/dashboard` calls `/api/app/session` to prove protected session state.

Haravan access/refresh tokens stay server-side only.

## Verification

From the workspace root:

```bash
npm run verify
```

This runs:

- server lint/typecheck
- server lifecycle tests
- server build
- client lint/typecheck
- client build
- env documentation consistency check
- static anti-pattern scan

You can run narrower checks:

```bash
npm run verify:server
npm run verify:client
npm run verify:lifecycle
npm run verify:env
npm run scan:anti-patterns
```

## Starting a new app from this base

1. Copy the whole workspace to a new app repo.
2. Rename package names in root, `server/package.json`, and `client/package.json`.
3. Keep lifecycle modules unchanged until tests pass in the new repo.
4. Add app-specific domain modules under separate `server/src/<feature>/` and `client/src/features/<feature>/` folders.
5. Choose recipes only when the app needs them.
6. Run `npm run verify` before adding product logic.

## Handoff checklist

- Read `docs/lifecycle.md` first.
- Read `docs/oauth-install-login.md` before changing auth/session code.
- Read `docs/webhook-subscription-uninstall.md` before changing webhook reducers.
- Read `docs/security-checklist.md` before production deploy.
- Read `docs/deploy.md` for Cloudflare/VPS deployment shape.
- Keep `.env.example` placeholder-only.
- Keep recipes optional.
