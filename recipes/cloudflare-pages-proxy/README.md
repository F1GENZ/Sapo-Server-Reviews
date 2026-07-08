# Cloudflare Pages Proxy Recipe

Status: stable lightweight deploy recipe.

Use this when the React client is deployed on Cloudflare Pages and must call the NestJS API through the same origin `/api/*` path so HttpOnly cookies work without exposing Haravan tokens to the browser.

## What exists in core

The starter already includes:

```text
client/functions/api/[[path]].js
```

The function:

- requires `BACKEND_URL`
- preserves incoming path and query string
- forwards method, headers, and body
- forwards `x-forwarded-host`, `x-forwarded-proto`, and client IP where present
- deletes the incoming `host` header before upstream fetch
- does not use hardcoded fallback production domains

## Cloudflare Pages variables

Set this in Cloudflare Pages project settings:

```text
BACKEND_URL=https://api.example.com
```

Do not set it to a Haravan app source project domain. Use the deployed API origin for the app built from this base.

## Client configuration

Production client should use same-origin API by default:

```text
VITE_API_BASE_URL=/api
```

If `VITE_API_BASE_URL` is omitted, the client env loader already defaults to `/api`.

## Cookie checklist

- Frontend and API are reached through the Pages origin for browser calls.
- API sets the app session cookie through `/api/auth/session/exchange`.
- Cookie is `HttpOnly` and `Secure` in production.
- Same-site deployments should use `SameSite=Lax`.
- Cross-site deployments must use `SameSite=None; Secure` and keep unsafe method origin checks enabled.

## Manual smoke test

1. Deploy server and set `FRONTEND_URL` to the Cloudflare Pages origin.
2. Set `API_BASE_URL` to the server origin.
3. Set Cloudflare `BACKEND_URL` to the server origin.
4. Open `/install/login` with fake/no HMAC locally or from Haravan Admin in real app config.
5. Complete OAuth/install.
6. Confirm `/dashboard` loads via `/api/app/session` and no access token appears in URL, localStorage, sessionStorage, or network response body.

## When not to use

Do not use this recipe if the client and API are served from the same Node origin already. In that case, call `/api` directly without Cloudflare Pages functions.
