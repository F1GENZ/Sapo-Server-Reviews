# One-click theme install

Admin page: `Hướng dẫn kỹ thuật` -> card `Cài tự động vào theme`. Worker code: `worker/src/core/theme-install/`.

The merchant picks a theme from `GET /admin/themes.json`. The app reads the theme files, finds where the loader, the review widget and the card badge belong, shows each change as a diff, and writes only after the merchant confirms.

## Requirements

- Scopes `read_themes,write_themes` in `SAPO_SCOPE` (see `docs/env-contract.md`). A store installed before these scopes existed returns `403 theme_scope_missing`; the UI offers a re-authorization through `/api/oauth/install/start`.
- Workers AI binding `AI` is optional. Without it, themes where no rule matches are reported as skipped and the merchant uses the manual guide.

## API (session + bearer, like every `/api/admin/*` route)

| Route | Body | Result |
|---|---|---|
| `GET /api/admin/theme-install/themes` | none | `[{ id, name, role, processing }]`, live theme first |
| `POST /api/admin/theme-install/plan` | `{ themeId }` | `{ hash, edits[], warnings[] }`; writes nothing |
| `POST /api/admin/theme-install/apply` | `{ themeId, planHash }` | `{ inserted, createdFiles, verification, warnings }`; `409 plan_changed` returns the fresh plan |
| `POST /api/admin/theme-install/uninstall` | `{ themeId }` | `{ removedFrom, deletedFiles }` |

## What gets written

| Target | File | Inserted line |
|---|---|---|
| `loader` | the layout that contains `content_for_layout` | `{% include 'f1genz-reviews-loader' %}` before `</head>` (else before `</body>`) |
| `widget` | product template or `snippets/product-snippet*` | `{% include 'f1genz-reviews-widget' %}` after `{% include 'product-reviews' %}`, else before a related-products include |
| `badge` | `snippets/product-item*`, `product-card*`, `product-grid*` ... | `{% include 'f1genz-rating-badge-card' %}` after the heading that holds `product.name` |

New snippet files: `snippets/f1genz-reviews-loader.bwt`, `f1genz-reviews-widget.bwt`, `f1genz-rating-badge-card.bwt`. Nothing else in the theme is changed.

What counts as already installed (`present`, left alone):

- the candidate layout, product and card files contain our include, the loader, `<f1genz-reviews*>`, `<f1genz-qna*>` or `<f1genz-rating-badge>`;
- any other `snippets/*review*`, `*f1genz*` or `*loader*` file (first 12, ours excluded) loads F1GENZ, for example a custom `lxs-reviews-loader`;
- on the live theme, the rendered home page or a product page already contains the loader or `<f1genz-reviews*>`. This is an extra signal; a failed fetch is ignored. A loader injected only by script is not visible to it.

## Safety protocol

1. Insertion point must be plain HTML text: not inside a tag, `<script>`, `<style>`, `{% for %}`, `{% capture %}`, `{% comment %}`, `{% raw %}`, or between `{% case %}` and its first `{% when %}`.
2. The inserted file minus our include line must equal the original byte for byte (CRLF preserved) before anything is written.
3. Order of writes: new snippet files first (nothing includes them yet), then one include line per file, the loader last.
4. Each write is read back and compared with the original plus one line.
5. On the live theme (`role: main`) the storefront is fetched after every file: HTTP 200 and no Liquid error text. A missing marker is a warning only (Sapo cache).
6. Any failure restores every modified file from the in-request copy and deletes the new snippets. The result carries `code: install_rolled_back` and `cause`.
7. `apply` recomputes the plan and requires the same `hash`; a changed theme or a different anchor returns `409 plan_changed`.
8. One operation per store at a time (`lock:theme-install:{store}`, 180 s).

Sapo has no theme preview URL (the Haravan `?themeid=` form, `theme_id`, `preview_theme_id` and `theme` were all ignored on a storefront), so a theme that is not live is verified by read-back only.

A merchant who edits or replaces the theme later loses the includes; run the card again. `uninstall` removes only lines that are exactly our include tags and the three snippet files.

## Anchor coverage (measured 2026-11-12, read-only, 8 themes of 2 F1GENZ shops)

| Target | Rule match | Already integrated | No rule match |
|---|---|---|---|
| loader | 6 | 2 | 0 |
| widget | 5 | 1 | 2 (stock `DefaultTheme`, custom lux-shoes theme) |
| badge (per card file, 49 files) | 24 | 5 | 20 |

Most no-match card files are variant cards (`product-card-demo`, `product-card-variant`, `product-item-compare`, `product-item-together`, `product-grid-item`). The sample is mostly one theme family, so these figures do not predict coverage on arbitrary Sapo themes.

When no rule matches, Workers AI proposes a line number (15 s timeout, rate limited; a failure just means no AI anchor). It is accepted only if it passes rule 1 above, is always marked `AI` in the plan, and is not a substitute for reading the diff. The model was not evaluated on real theme files.

## Real-shop verification (2026-11-12)

The service bundle ran in the admin tab of `f1genz-seafoods.mysapo.net` (admin cookie session instead of the app token) against the unpublished theme `1033856`:

| Step | Result |
|---|---|
| `plan` | 7 inserts (loader, widget, 5 badges), 3 card files skipped, warnings for the old Sapo review block and badge |
| `apply` | 10 PUT, all `200`; snippets first, loader last; all 7 read-backs equal original plus one line |
| `plan` again | every inserted spot reported `present` |
| `uninstall` | 7 PUT and 3 DELETE, all `200`; 232 assets before and after, 100 `.bwt` files byte-identical by SHA-256 |
| rollback (write of `product-snippet.bwt` forced to fail) | 5 badge files restored in reverse, 3 snippets deleted, 232 assets, 0 files changed |
| `plan` on the live theme (read only) | manual installs recognised as `present`; 2 card files proposed |

Not covered: the app token path (`read_themes,write_themes` not yet granted), the live-theme write path with its storefront checks (only unit-tested against a fake storefront), the AI path, and rendering of the inserted Liquid (Sapo cannot preview an unpublished theme).
