# Page Builder Recipe

Status: deferred backlog note. Not core V1.

This recipe is for future apps that need a merchant-facing page/template builder. The lifecycle starter must not include builder/editor dependencies by default.

## When to enable later

Use only when a real app needs:

- merchant-editable page blocks
- template preview
- controlled HTML rendering
- content versioning
- publish/draft workflows

## Required boundaries

- Keep builder tables and APIs app-specific.
- Use core `ShopAuthGuard` for all protected APIs.
- Resolve Haravan access token server-side only.
- Do not store app auth tokens in browser storage.
- Do not weaken lifecycle install/session rules for preview routes.

## Security requirements

- Treat merchant-authored HTML as untrusted.
- Sanitize rendered HTML server-side or with a strict allowlist.
- Avoid raw `innerHTML`; if unavoidable, wrap it in a reviewed renderer component with sanitization tests.
- Iframe preview should use sandbox restrictions.
- Content assets need type/size validation.

## Suggested future modules

```text
server/src/page-builder/
client/src/features/page-builder/
```

Do not add these folders until app scope requires them.

## When not to use

Do not use this recipe for simple settings/metafields forms. Use a smaller app-specific settings module instead.
