# Phase 15 — Admin SPA Foundation

**Goal:** Vite React shell: routing, layout, axios/API client, react-query, identity module, error/toast infra.
**Depends on:** 02

## Reference

- `client/src/`: `main.jsx`, `App.jsx`, `index.css`, `common/{ApiService.js, AxiosConfig via config/AxiosConfig.js,
  routes.js, queryClient.js, queryKeys.js, getErrorMessage.js, toast.jsx, antdTheme.js, BuildInfo.js, ErrorReporter.js}`,
  `config/AxiosConfig.js`, `hooks/useOrgRoute.js`, `components/{layout/AdminLayout.jsx, OrgLink.jsx, ProductSearch.jsx}`.
- Stack: React 19, antd 5, @tanstack/react-query 5, react-router-dom 7, tailwind 4.

## Build (new project `client/src/`)

- Port shell: `main.jsx`, `App.jsx`, router, antd theme, query client, toast, error reporter.
- **`common/identity.js` (NEW):** single source for the identity param name = `store` (store domain) + accessor,
  replacing scattered `orgid` literals.
- Port `config/AxiosConfig.js`: base = `API_URL`; attach identity (store domain) + session token per reference;
  401 → re-auth redirect.
- Port `hooks/useOrgRoute.js` → `useStoreRoute.js` (store-domain in route/query).
- Port `components/layout/AdminLayout.jsx`, `OrgLink.jsx` → `StoreLink.jsx`, `ProductSearch.jsx`.
- Port `queryKeys.js` (swap `orgid` keys → `store`).

## Steps

1. Scaffold Vite app; port shell + providers.
2. Introduce `identity.js`; grep-replace `orgid` usages via it.
3. Port axios config with store-domain identity + session token header/param.
4. Port routing + layout with placeholder feature routes (filled P17).

## Contracts / notes

- Keep `budget` + `smoke` scripts green (perf budget + route smoke) — do not regress bundle size.
- Deployed behind Cloudflare Pages (`functions/api/[[path]].js` proxy) — base URL config must match (P18).

## Tests / validation

- `npm --prefix client run build && budget && smoke` green with stubbed pages.
- Manual: app shell renders; navigation works; API client attaches identity + token.

## Acceptance

- SPA shell builds and routes; identity centralized; no `orgid` literal remains.

## Risks

- Bundle budget: the reference has a performance budget script — keep imports lean; verify after porting antd.
