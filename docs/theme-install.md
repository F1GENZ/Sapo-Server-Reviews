# One-click theme install

Admin page: the first page after install (`Tổng quan`) and `Hướng dẫn kỹ thuật` both show the card `Cài tự động vào theme`. Worker code: `worker/src/core/theme-install/`.

The merchant picks a theme from `GET /admin/themes.json`. The card preselects the first theme whose role is not `main` (unpublished), so the first apply lands on a copy the merchant can preview. With no unpublished theme nothing is preselected: the card says to duplicate the live theme in Sapo, and choosing the live theme shows a warning and keeps the plan modal's live acknowledgement. After Apply, `Xem trước` opens `https://{store}/?previewThemeId=<id>` (the live theme gets `Mở cửa hàng`, the storefront root). The app reads the theme files, finds where the loader, the review widget and the card badge belong, shows each change as a diff, and writes only after the merchant confirms.

## Staying in the Sapo admin after install

A completed install callback (`flow: install`, including the scope re-authorization from the card) answers `302 https://{store}/admin/apps/f1genz-reviews-danh-gia-san-pham` instead of the admin SPA origin. The handle is `SAPO_APP_ADMIN_HANDLE` in `worker/src/core/sapo/admin-app-url.ts`; the URL is only built for `*.mysapo.net` stores and any other store value falls back to the previous redirect to `FRONTEND_URL` with a handoff code. Sapo then opens the Application URL in the admin iframe with a signed launch query, which the SPA exchanges for a session as for every launch. Login-flow callbacks are unchanged.

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
| `widget` | the product page include chain (see Anchor coverage) | `{% include 'f1genz-reviews-widget' %}` at the best ranked position |
| `badge` | `snippets/product-item*`, `product-card*`, `product-grid*` ... | `{% include 'f1genz-rating-badge-card' %}` after the heading that holds `product.name`, else before the price block |

New snippet files: `snippets/f1genz-reviews-loader.bwt`, `f1genz-reviews-widget.bwt`, `f1genz-rating-badge-card.bwt`. Nothing else in the theme is changed.

What counts as already installed (`present`, left alone):

- the candidate layout, product chain and card files contain our include, the loader, `<f1genz-reviews*>`, `<f1genz-qna*>` or `<f1genz-rating-badge>` (a widget hand-installed in an included tab snippet is found through the chain);
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

## Anchor coverage (measured 2026-11-13, dry-run on 17 Sapo themes, read-only)

Corpus: the 7 themes of `f1genz-seafoods.mysapo.net` (stock `DefaultTheme`, a clean copy of it, four 2025 F1GENZ SeaFood themes and the live one; files read with the admin cookie session, GET only; asset keys kept in the order the Sapo API returned them) and 10 Sapo themes in the workspace (F1GENZ GenZ, Hestia, Purity, Lux Shoes, Aqua, Devs2 S2 Spa, Nau Atelier and two converter outputs). A theme counts as a success when the loader, the widget and at least one card badge are `insert` or `present`.

This is an in-sample measurement: the rules were tuned on these same themes and most of the 17 belong to the F1GENZ / converter family. There is no held-out set, and `DefaultTheme` is the only stock Sapo theme in it. Read the figures as "no known theme in our own set is skipped", not as a rate for an arbitrary Sapo theme.

| Measure | Before | After |
|---|---|---|
| themes fully handled (loader + widget + >=1 badge) | 5 / 17 | 17 / 17 |
| widget `insert` / `present` / `skipped` | 4 / 1 / 12 | 11 / 6 / 0 |
| card files `insert` / `present` / `skipped` (79 files) | 44 / 8 / 27 | 51 / 8 / 20 |
| theme file reads per plan, sum over the corpus | 211 | 160 |

Where the 11 widget inserts land (rank, see below): rank 0 five, rank 1 none, rank 2 two, rank 3 four (Nau Atelier, F1GENZ GenZ, Devs2 S2 Spa, F1GENZ Aqua), rank 4 none. Rank 3 is a heuristic on class names and has not been rendered; the 6 `present` widgets are hand installs found in the product chain or in a review snippet.

The widget was skipped on 12 themes. In the seafoods family the candidate list was cut to the first 8 keys of `templates/product*` and `snippets/product-*`; with the key order the Sapo API returned, `snippets/product-snippet.bwt` fell outside the cut on 3 of the 7 themes (17/04, 18/04 and the live one), and was inside it on the others, so that failure depended on key order. In the other themes no rule matched: the related section is an element rather than an include, the description sits in a variable, or the review block lives in an included tab snippet. Candidates now come from the include chain of `templates/product.bwt` (depth 2, at most 8 files, snippets whose name looks like a product, tab, detail or info part; galleries, cards, options, related, review and similar names are not followed), so the result no longer depends on key order. The chain is also what `uninstall` scans, together with the layout, product and card key patterns. Without `templates/product.bwt` the old key patterns apply, minus `product.item_*`, `product.article` and `product.viewed`. Residual risk: if an include of ours sits in a file outside that scan (a hand-moved include), `uninstall` still deletes the three snippet files and that include would point at a missing snippet; how Sapo renders that was not measured.

Widget position, best rule first (the first file in chain order wins a tie):

| Rank | Rule |
|---|---|
| 0 | right after `{% include 'product-reviews' %}` (Sapo's own block; plan warns that both blocks show) |
| 1 | right before an include whose name says related, recommend, upsell, cross-sell, recently or viewed |
| 2 | right after the line that holds `{{ product.content }}` |
| 3 | right before an element whose `class` or `id` says related, relate, recommend, upsell, cross-sell, recently or viewed; when that element sits directly inside an `{% if %}` (only blank or `assign` lines between), the point moves in front of the `{% if %}` so the widget is not hidden with the section |
| 4 | end of the product template, only when every `div`, `section`, `main`, `article` and `aside` opened in the file is closed before that point (so the widget cannot land inside a wrapper the file leaves open); the plan warns about it. Otherwise the widget is `skipped` with the paste-by-hand code |

Card badge position: after the one-line heading or the one-line `class="...title|name..."` element that holds `product.name` (the tag name may be a Liquid variable, as in `<{{ heading | default: 'h3' }}>`), else before the first price block, but only in a file that references `product.url`, `product.name`, `product.title` or `product.id` (placeholder cards are left alone).

When no rule gives a safe point, the target is `skipped` with a `manual` field: where to paste and the exact code. The card shows it with a copy button and a `Dán tay` tag; the plan warning names the target. Nothing is skipped silently.

Workers AI is asked only when no rule produced an anchor. The prompt now carries the exact list of valid line numbers (from the safety scan), the answer is parsed whether Workers AI returns text, a code-fenced JSON, an already parsed object or a numeric string (`parseInsertionAnswer`), and a line that is off by up to 2 is snapped to the nearest valid point. A rejection is logged with a reason code (`no_json`, `invalid_json`, `empty`, `line_invalid`, `not_safe_point`). The earlier code read only string answers, so a pre-parsed `{ "line": n }` was discarded as empty; this is a measured defect of the parser, not a confirmed cause of the 2026-11-12 DefaultTheme run, which was not logged. The AI path has not been exercised against Workers AI: bindings for it are remote only, and this change was developed without remote access.

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

## Round trip on whole themes (2026-11-13, simulated store)

The service ran `plan`, `apply`, a second `plan` and `uninstall` against an in-memory store holding every `.bwt` file of each corpus theme (no network, no shop). All 17 themes: the second plan reported nothing left to insert, and after `uninstall` every file matched its original SHA-256 and no file was added, with one expected exception: the `DefaultTheme` copy that already carries a loader include and snippet from the 2026-11-12 test, which `uninstall` removed (2 files differ from the pulled copy, 0 differ from the clean copy). This exercises the write path of the current code but not Sapo's API, so it does not replace the real-shop run above.
