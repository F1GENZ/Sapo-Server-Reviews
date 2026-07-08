# Phase 11 — Media Pipeline (R2 + Worker)

**Goal:** Image/video upload for reviews via Cloudflare R2 + signed tickets. Platform-independent — port near-verbatim.
**Depends on:** 03

## Reference

- `server/src/media/`: `media.service.ts`, `media.controller.ts` (admin), `public-media.controller.ts`
  (storefront upload), `media.module.ts`, `dto/*`, `media.service.spec.ts`.
- `worker/`: `src/index.js` (R2 upload handler), `wrangler.toml` (bucket `f1genz-images`, `UPLOAD_SECRET`, CDN domain).
- Env: `R2_PUBLIC_DOMAIN`, `R2_WORKER_URL`, `PUBLIC_UPLOAD_TICKET_SECRET`, `R2_UPLOAD_SECRET`/`UPLOAD_SECRET`.
- Client: `client/src/hooks/useMediaUpload.js`, `common/mediaUrl.js` (consumed in P17).

## Build (new project)

- `src/media/*` — port service + controllers + DTOs as-is. Signed upload tickets (HMAC) unchanged.
- `worker/*` — port; new bucket name `f1genz-sapo-images` ‹confirm›, new CDN domain, own `UPLOAD_SECRET`.
- Ensure `PUBLIC_UPLOAD_TICKET_SECRET` gates storefront (anonymous) uploads; size/type limits preserved.

## Steps

1. Port media module + worker; rename bucket/domain/secret.
2. Confirm ticket-signing secret matches worker secret (`R2_UPLOAD_SECRET`/`UPLOAD_SECRET`).
3. Keep storefront upload path CORS-open to Sapo store origins (P03 CORS).

## Contracts / notes

- No Sapo API dependency — the only edits are new bucket/domain/secret + CORS origins.
- Public upload requires a valid short-lived ticket; keep abuse limits.

## Tests / validation

- Port `media.service.spec.ts`; passes.
- Manual: request ticket → upload to worker → returned CDN URL is publicly fetchable; oversized/invalid rejected.

## Acceptance

- Review media upload works from admin and storefront; URLs render on the widget.

## Risks

- Secret mismatch between server and worker → uploads 401; document the shared-secret requirement (as reference does).
