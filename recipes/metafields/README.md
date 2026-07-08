# Metafields Recipe

Status: deferred backlog note. Not core V1.

Use this for future apps that need Haravan resource/metafield CRUD. The base lifecycle only proves authentication, install, webhook, subscription, and uninstall.

## When to enable later

Enable only when a real app needs to read/write app-owned Haravan metafields for:

- products
- collections
- pages
- shops
- app-specific settings

## Required boundaries

- All APIs use `ShopAuthGuard`.
- Client sends `x-orgid` only as context; server session remains the authority.
- Server resolves Haravan access token with lifecycle checks.
- Writes are blocked when install status is `canceled`, `expired`, `needs_reinstall`, `declined`, or `uninstalled`.
- Do not create generic metafield UI in the base.

## Suggested future API shape

```text
GET  /api/metafields/:ownerType/:ownerId
POST /api/metafields/:ownerType/:ownerId
PUT  /api/metafields/:ownerType/:ownerId/:metafieldId
DELETE /api/metafields/:ownerType/:ownerId/:metafieldId
```

Add route and payload validation before enabling.

## Testing checklist

- rejects missing/invalid session
- rejects orgid mismatch
- rejects blocked lifecycle status
- never returns Haravan token material
- handles Haravan API failure without clearing install state unless `invalid_grant` policy applies

## When not to use

Do not use this recipe for lifecycle state. Lifecycle status and tokens belong to core Prisma models, not Haravan metafields.
