# Recipe Backlog

Recipes are optional. Core V1 must run without them.

| Recipe | Status | Use when | Path |
|---|---|---|---|
| Cloudflare Pages proxy | stable lightweight deploy recipe | frontend is on Cloudflare Pages and API should stay same-origin `/api` | `recipes/cloudflare-pages-proxy/README.md` |
| PM2 deploy | stable lightweight deploy recipe | server is deployed on VPS/PM2 | `recipes/pm2-deploy/README.md` |
| Queue worker | deferred backlog | webhook volume or slow jobs require background processing | `recipes/queue-worker/README.md` |
| Page builder | deferred backlog | product needs merchant-editable page/template builder | `recipes/page-builder/README.md` |
| Metafields | deferred backlog | product needs Haravan metafield/resource CRUD | `recipes/metafields/README.md` |
| R2 uploader | deferred backlog | product needs merchant file/media uploads | `recipes/uploader-r2/README.md` |
| Advanced rate limit | deferred docs note | app-specific expensive/domain actions need throttles | `recipes/rate-limit-advanced/README.md` |
| Ops dashboard | deferred backlog | operators need failed webhook/job retry and worker visibility | `recipes/ops-dashboard/README.md` |

## Selection rules

- Add a recipe only when a real app requirement needs it.
- Keep recipe code out of core lifecycle modules unless it becomes a public contract.
- Do not import old app-specific domain logic into recipes without revalidating security boundaries.
- Recipes must keep Haravan tokens server-side and reuse core guards/session rules.

## V1 stable recipes

Only Cloudflare Pages proxy and PM2 deploy are stable enough for immediate use because they describe deployment shape and do not add core runtime dependencies.

## V1 deferred recipes

Queue/worker, page builder, metafields, R2 uploader, advanced rate limits, and ops dashboard are backlog docs. They are not hidden implementation scope for this starter.
