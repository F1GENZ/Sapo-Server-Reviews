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
| `POST /api/admin/theme-install/uninstall` | `{ themeId }` | `{ removedFrom, deletedFiles, keptFiles, notChecked }` |

## What gets written

| Target | File | Inserted line |
|---|---|---|
| `loader` | the layout that contains `content_for_layout` | `{% include 'f1genz-reviews-loader' %}` before `</head>` (else before `</body>`) |
| `widget` | the product page include chain (see Anchor coverage) | `{% include 'f1genz-reviews-widget' %}` at the best ranked position |
| `badge` | `snippets/product-item*`, `product-card*`, `product-grid*` ... | `{% include 'f1genz-rating-badge-card' %}` right after the price block (else after the `product.name` heading, else before the price) |
| `schema` | the same file as the widget include | `{% include 'f1genz-product-schema' %}` written in the same asset write, on the line right after the widget include; when the widget is `skipped` the schema is `skipped` too (the storefront script still mounts JSON-LD client-side, so SEO never goes entirely dark) |

New snippet files: `snippets/f1genz-reviews-loader.bwt`, `f1genz-reviews-widget.bwt`, `f1genz-rating-badge-card.bwt`, `f1genz-product-schema.bwt`. Nothing else in the theme is changed, with one exception below.

**Legacy badge.** A card line that is a self-contained legacy Sapo badge (an element whose class contains `sapo-product-reviews-badge`, or an include of it) is wrapped in a Liquid comment block:

```
{% comment %} f1genz-hide-legacy-badge
  <div class="sapo-product-reviews-badge"></div>
{% endcomment %}
```

It stops rendering, the surrounding markup is untouched, and `uninstall` unwraps the block so the file returns byte for byte. A badge whose markup spans several lines is left alone (commenting one line would break it) and nothing is hidden silently. The plan shows it as `status: hide` and the card as `Ẩn badge cũ`.

What counts as already installed (`present`, left alone):

- the candidate layout, product chain and card files contain our include, the loader, `<f1genz-reviews*>`, `<f1genz-qna*>` or `<f1genz-rating-badge>` (a widget hand-installed in an included tab snippet is found through the chain);
- any other `snippets/*review*`, `*f1genz*` or `*loader*` file (first 12, ours excluded) loads F1GENZ, for example a custom `lxs-reviews-loader`;
- on the live theme, the rendered home page or a product page already contains the loader or `<f1genz-reviews*>`. This is an extra signal; a failed fetch is ignored. A loader injected only by script is not visible to it.

## Safety protocol

1. Insertion point must be plain HTML text: not inside a tag, `<script>`, `<style>`, `{% for %}`, `{% capture %}`, `{% comment %}`, `{% raw %}`, or between `{% case %}` and its first `{% when %}`.
2. The inserted file minus our include line must equal the original byte for byte (CRLF preserved) before anything is written.
3. Order of writes: new snippet files first (nothing includes them yet), then one include line per file, the loader last.
4. After the writes, every touched file is read back in parallel and compared with the original plus one line.
5. On the live theme (`role: main`) the storefront is fetched once per touched target after all writes: HTTP 200 and no Liquid error text. A missing marker is a warning only (Sapo cache).
6. Any failure restores every modified file from the in-request copy and deletes the new snippets. The result carries `code: install_rolled_back` and `cause`.
7. `apply` recomputes the plan and requires the same `hash`; a changed theme or a different anchor returns `409 plan_changed`.
8. One operation per store at a time (`lock:theme-install:{store}`, 180 s).

An unpublished theme can be previewed: `https://{store}/?previewThemeId=<id>` answers `302` to the same path without the parameter and sets a cookie, and the storefront then renders that theme (measured 2026-11-26 on `f1genz-seafoods.mysapo.net`, theme `1033856`: the loader include that exists only in that theme appeared in the HTML). The Haravan `?themeid=`/`theme_id`/`preview_theme_id`/`theme` forms stay ignored. The card's `Xem trước` button uses it.

A merchant who edits or replaces the theme later loses the includes; run the card again. `uninstall` reads **every** `.bwt` file of the theme (not just the ones the install wrote) and removes our include wherever it sits — whole line or inline inside markup — then unwraps hidden legacy badges. Snippet files are deleted only when the whole theme was read; past 160 `.bwt` files the sweep is skipped, the four snippets are kept, and the result reports `notChecked` and `keptFiles`, because deleting a snippet that some unseen file includes would leave a dangling include.

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

Card badge position: right after the price block (the closing line of the first element whose `class` contains `price`, counted through nested tags), else after the one-line heading or the one-line `class="...title|name..."` element that holds `product.name` (the tag name may be a Liquid variable, as in `<{{ heading | default: 'h3' }}>`). Only files that reference `product.url`, `product.name`, `product.title` or `product.id` are touched (placeholder cards are left alone). A self-contained legacy Sapo badge line is hidden in the same write, once — a second install never nests a second comment block around it; it is not counted as a badge position. At most 12 card files are read, and the plain names (`product-item`, `product-card`, `product-grid-item`, `item-product`, `product-box`, `product-loop`, `product-thumb`) are read before the variants, so the file that actually renders the card is never the one cut by the limit (measured defect 2026-11-26: `snippets/product-item.bwt` sat after eight `product-item-*`/`product-card-*` keys and the badge landed everywhere but the collection grid).

When no rule gives a safe point, the target is `skipped` with a `manual` field: where to paste and the exact code. The card shows it with a copy button and a `Dán tay` tag; the plan warning names the target. Nothing is skipped silently.

Workers AI is asked only when no rule produced an anchor. The prompt carries the exact list of valid line numbers (from the safety scan) and the answer is parsed whether Workers AI returns text, a code-fenced JSON, an already parsed object, a numeric string, truncated JSON or prose that names a line (`parseInsertionAnswer`); a line that is off by up to 2 is snapped to the nearest valid point. Every rejection is now named in the plan as `AI không đề xuất được vị trí cho <target> trong <file> (<code>)`, with the codes `not_configured`, `rate_limited`, `no_safe_line`, `no_json`, `empty`, `line_invalid`, `unavailable` and `line_<n>_not_safe`.

Measured on production 2026-11-26 (worker `5f9a1378`, store `f1genz-seafoods.mysapo.net`, an unpublished theme copy whose product template was temporarily reduced to a rule-less stub, then restored byte for byte): before the parser fix 6/6 plans reported `invalid_json` because the model echoed the file's Liquid braces into its JSON; after the fix 4/4 plans returned the same anchor, apply wrote `{% include 'f1genz-reviews-widget' %}` on the line the model chose, readback matched, and `uninstall` removed it. A rule-less template is the only condition that reaches this path on the measured corpus, so a normal theme never pays the AI latency.

## Storefront render (2026-11-26, worker `b0b52388`, theme `1033856`)

Installed into the unpublished theme, then opened `/?previewThemeId=1033856` with the shop's own cookie session:

| Measure | Result |
|---|---|
| `/collections/all` badges | 12 `f1genz-rating-badge` elements, all with a non-zero box |
| badge text for the rated product (`44284145`) | `(7 đánh giá)`, 5 star nodes rendered |
| badge position | `previousElementSibling` is `.product-item-detail-price`; badge top 1263 vs price bottom 1261 |
| legacy Sapo badge in the DOM | 0 elements — the hidden block never reaches the browser |
| product page | `<f1genz-reviews>` visible below the price, tabs `Đánh giá / Hỏi đáp / Đánh giá sản phẩm (7)`, no Liquid error text |
| uninstall, one pass | 8 files rewritten, 3 snippets deleted, all 8 files back to their baseline SHA-256 |
| uninstall sweep | 137 `.bwt` files, under the 160-file cap, so the sweep runs and the snippets are deleted; the sweep costs 83 s (one asset GET per file, Sapo leaky bucket), inside the 120 s client timeout |
| inline include | `removeIncludes` also strips an include that sits inside markup (unit-tested), so a hand-pasted inline include cannot outlive its snippet |

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
