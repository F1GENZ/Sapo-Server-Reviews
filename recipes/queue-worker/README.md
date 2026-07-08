# Queue Worker Recipe

Status: deferred backlog note. Not required for V1 lifecycle correctness.

The core server persists webhook events and processes lifecycle reducers inline. A queue/worker can be added later when webhook volume or app-specific jobs require background processing.

## When to enable later

Use a queue when:

- webhook reducers become slow
- app-specific jobs call external APIs repeatedly
- retry windows need backoff beyond the inline response path
- an ops dashboard needs failed-job retry controls
- a real app has measurable webhook volume that risks request timeouts

## Required boundaries

A future worker must keep these invariants:

- POST webhook still verifies HMAC before any state change.
- Webhook event is inserted idempotently before enqueue.
- Queue enqueue failure does not lose the event; the DB event/outbox remains recoverable.
- Worker reprocesses by persisted `WebhookEvent.id`, not raw untrusted request input.
- Duplicate jobs must not rerun reducers after event status is `processed`.
- Uninstall and token refresh still share lifecycle generation/lock guards.

## Suggested shape

```text
worker/
  src/main.ts
server/src/haravan/webhook-outbox.service.ts
server/src/haravan/webhook-worker.processor.ts
```

Possible packages: BullMQ + Redis, but do not add this dependency until needed.

## Recovery checklist

A future queue must include:

- sweeper for `failed`/`received` events with `nextRetryAt <= now`
- max attempts
- dead-letter state
- worker heartbeat
- protected readiness/ops visibility

## When not to use

Do not add a worker just to satisfy the base template. V1 is intentionally inline/outbox-compatible to avoid BullMQ coupling before a real app needs it.
