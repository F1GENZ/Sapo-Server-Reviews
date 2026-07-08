# Advanced Rate Limit Recipe

Status: deferred docs note. Minimal public ingress rate limiting is already core.

The base already rate-limits OAuth, HMAC verification, session exchange, webhook challenge/delivery, and readiness exposure paths. This recipe is only for app-specific throttles.

## When to enable later

Use when a real app needs limits such as:

- per-customer campaign participation
- coupon redemption windows
- expensive report generation
- write-heavy resource endpoints
- app-specific abuse controls

## Required boundaries

- Do not replace core public ingress limits.
- Use Redis namespaced keys with TTL.
- Avoid Redis `KEYS`; use deterministic keys or SCAN for operations.
- Include orgid/session identity where available.
- Use IP only as one input, not sole identity for authenticated app actions.

## Suggested key shape

```text
{REDIS_KEY_PREFIX}:rate:domain-feature:{orgid}:{resource}:{window}
```

## Response behavior

Return HTTP 429 with a clear retry time. Avoid leaking tenant-level usage details to other tenants.

## When not to use

Do not add domain-specific limits to the starter until the product domain exists. Keep this recipe as guidance only.
