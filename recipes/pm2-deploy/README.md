# PM2 Deploy Recipe

Status: stable lightweight deployment guide.

Use this when deploying the NestJS server on a VPS with PostgreSQL, Redis, and PM2.

## Production principles

- Use `npm ci`, not `npm install`.
- Build before reload.
- Run Prisma migrations before reload.
- Never use `pm2 --watch` in production.
- Keep `.env` on the server only; never commit it.
- Verify `/livez` and protected `/readyz` after reload.

## Server deploy order

From `server/`:

```bash
npm ci
npm run db:generate
npm run build
npm run db:migrate
pm2 start dist/main.js --name haravan-app-base-api --time
pm2 save
```

For an existing process:

```bash
npm ci
npm run db:generate
npm run build
npm run db:migrate
pm2 reload haravan-app-base-api --update-env
```

## Health checks

Public liveness:

```bash
curl -fsS https://api.example.com/livez
```

Protected readiness:

```bash
curl -fsS -H "Authorization: Bearer $READINESS_TOKEN" https://api.example.com/readyz
```

`/readyz` may expose dependency status and webhook degraded counts. Keep it protected.

## Environment checklist

- `NODE_ENV=production`
- `FRONTEND_URL=https://app.example.com`
- `API_BASE_URL=https://api.example.com`
- `CORS_ALLOWED_ORIGINS=https://app.example.com`
- Haravan callback URLs match deployed API routes.
- `APP_SESSION_SECRET`, `DATA_ENCRYPTION_KEY`, `HRV_CLIENT_SECRET`, `HRV_WEBHOOK_SECRET`, `HRV_WEBHOOK_VERIFY_TOKEN`, and `READINESS_TOKEN` are real secrets.
- Redis and PostgreSQL credentials are real server-side values only.
- `HRV_WEBHOOK_AUTO_SUBSCRIBE` is explicit.
- `HRV_WEBHOOK_URL` is set when auto subscribe is true.

## Rollback notes

If deploy fails before migration, reload the previous PM2 process and inspect logs:

```bash
pm2 logs haravan-app-base-api --lines 100
```

If migration has run, rollback depends on the Prisma migration contents. Do not delete production data to force a rollback; create a forward fix or restore from backup.

## When not to use

Do not use this recipe for serverless-only deployments. The server depends on long-lived API runtime access to Redis/PostgreSQL and benefits from a normal Node process.
