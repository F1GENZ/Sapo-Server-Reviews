# Webhook, Subscription, and Uninstall Lifecycle

This document explains webhook registration/challenge/delivery, subscription snapshots, and uninstall cleanup.

## Routes

| Route | Purpose |
|---|---|
| `GET /api/oauth/install/webhooks` | Haravan challenge verification. |
| `POST /api/oauth/install/webhooks` | Webhook event delivery. |
| `GET /readyz` | Protected dependency/webhook degraded-state readiness. |

## Webhook registration

When `HRV_WEBHOOK_AUTO_SUBSCRIBE=true`, install attempts lifecycle webhook registration after token persistence.

Core topics:

- `app_subscriptions/update`
- `app/uninstalled`
- `shop/update`

Registration status is stored on `AppInstall.webhookRegistrationStatus`:

- `not_configured`
- `pending`
- `registered`
- `degraded`
- `failed`

Registration failure must be visible in protected readiness or app status. It must not be silently ignored.

Haravan registration endpoint behavior can differ by app type, so production onboarding should include the manual checklist below.

## Manual registration checklist

For a real Haravan app:

1. Confirm `HRV_SCOPE_INSTALL` includes webhook capability (`wh_api` unless Haravan docs/app settings require another scope).
2. Confirm Haravan app settings use the deployed `HRV_WEBHOOK_URL`.
3. Install app in sandbox org.
4. Confirm registration call succeeds or Haravan Admin shows the webhook subscription.
5. Call protected `/readyz` and confirm no `degraded`/`failed` webhook count for the test org.
6. Trigger or simulate subscription/update/uninstall events.
7. Confirm `WebhookEvent` rows are created once per delivery/idempotency key.

## GET challenge

`GET /api/oauth/install/webhooks`:

- requires `hub.verify_token`
- requires `hub.challenge`
- compares token with configured `HRV_WEBHOOK_VERIFY_TOKEN`, not the POST HMAC secret
- returns challenge as plain text
- performs no state mutation

## POST delivery contract

POST delivery order is strict:

1. content type and body size checks
2. raw body capture
3. HMAC verification with `HRV_WEBHOOK_SECRET`
4. topic normalization
5. payload/domain identity resolution
6. query/header orgid compatibility cross-check
7. idempotent `WebhookEvent` insert
8. inline lifecycle reducer
9. processed/failed/ignored status update

No state mutation is allowed before HMAC verification and identity cross-check.

## Topic aliases

Canonical groups:

| Canonical | Accepted aliases |
|---|---|
| `app_subscriptions/update` | `app_subscriptions/update` |
| `app/uninstalled` | `app_uninstall_webhook`, `app_uninstall`, `app/uninstall`, `app/uninstalled`, `apps/uninstall`, `apps/uninstalled`, `app_uninstalled` |
| `shop/update` | `shop/update`, `shops/update`, `shop_update`, `shops_update`, `shop_update_webhook` |

Unknown topics are persisted and ignored.

## Identity binding

Trusted identity is resolved from signed payload org/domain data plus known domain mappings.

- Query/header orgid is compatibility input only.
- Query/header orgid must match resolved payload/domain orgid.
- Header/query orgid alone is not enough for non-subscription mutation.
- Domain mappings are active/tombstoned and must not revive uninstalled installs silently.

## Idempotency

Idempotency key priority:

1. provider event id when present
2. deterministic hash of topic + resolved org/domain + payload hash

Duplicate deliveries already marked processed/ignored return success with a duplicate marker and do not rerun reducers. Retries of failed/received/processing events rerun the reducer from the persisted idempotency key.

Do not use random fallback IDs for webhook idempotency.

## Subscription snapshots

Subscription webhook may arrive before install.

The reducer stores `SubscriptionSnapshot` by correlation keys:

- orgid when trusted/resolved
- normalized domain
- subscription id
- payload hash

Install applies best matching snapshot by orgid/domain. Active paid snapshot sets `status=active`, `plan=Pro`; canceled/inactive/expired maps to free/canceled/expired policy unless the app is already uninstalled.

## Uninstall cleanup

Uninstall reducer must:

1. resolve org/domain and cross-check compatibility orgid
2. use lifecycle lock/generation guard
3. clear Redis install/session/domain/runtime keys
4. null DB access/refresh token ciphertext, IV, tag, and expiry
5. set `status=uninstalled`
6. increment `lifecycleGeneration` and `tokenVersion`
7. tombstone active domains
8. preserve merchant data by default

Token refresh writes after uninstall are rejected by conditional generation/status update.

## Tests covering this flow

`server/test/lifecycle.test.ts` covers:

- challenge verification behavior
- webhook raw-body HMAC verification
- webhook HMAC secret separation from client secret
- header/query orgid mismatch rejection
- query/header orgid alone rejection
- deterministic duplicate handling
- subscription snapshot pre-install correlation
- subscription status reducer
- uninstall token clearing and domain tombstone
- token refresh generation guard after uninstall
- topic alias normalization
