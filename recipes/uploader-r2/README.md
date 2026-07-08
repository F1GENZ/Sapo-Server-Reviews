# R2 Uploader Recipe

Status: deferred backlog note. Not core V1.

Use this for future apps that need direct-to-object-storage uploads, usually Cloudflare R2.

## When to enable later

Enable when the product needs merchant media/file uploads such as:

- images
- import files
- exported reports
- page builder assets

## Required design

- Backend issues short-lived signed upload tickets.
- Ticket is scoped to `orgid`, file purpose, max size, and content type.
- Client uploads directly to storage using the signed URL/ticket.
- Backend confirms the upload before storing durable metadata.
- Protected APIs use `ShopAuthGuard`.

## Validation requirements

- strict file size allowlist
- strict content-type allowlist
- extension checks are advisory only, not security
- malware scan or quarantine for risky file classes
- strict CORS on the bucket
- object keys include org/app namespace and random IDs
- no public bucket listing

## Suggested future modules

```text
server/src/uploads/
client/src/features/uploads/
```

## When not to use

Do not add R2 just for app icons or static assets. Use the frontend build pipeline for static assets.
