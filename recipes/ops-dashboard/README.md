# Ops Dashboard Recipe

Status: deferred backlog note. Depends on queue/worker or richer operational needs.

The V1 frontend includes only a protected lifecycle dashboard/session probe. A full ops dashboard is not part of core.

## When to enable later

Use when operators need to inspect and act on:

- webhook registration degraded/failed state
- failed webhook events
- retry queues
- worker heartbeat
- subscription state drift
- install/uninstall audit timeline
- app-specific background jobs

## Required boundaries

- All ops APIs use `ShopAuthGuard` or a separate admin-only guard.
- Do not expose Haravan token material.
- Do not expose `/readyz` details publicly.
- Retry actions must be idempotent and event-id based.
- Avoid destructive actions unless product policy and audit logging exist.

## Suggested future modules

```text
server/src/ops/
client/src/features/ops-dashboard/
```

## Minimum widgets later

- webhook registration status by org
- failed events with retry action
- worker heartbeat
- last successful webhook processed time
- last token refresh failure
- install status summary

## When not to use

Do not build this for V1. Protected `/dashboard` and `/readyz` already cover the lifecycle proof surface.
