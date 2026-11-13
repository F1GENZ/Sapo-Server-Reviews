import { BadRequestException, ConflictException, HttpException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { AiService } from '../ai/ai.service';
import { APP_ENV } from '../config/app-config.module';
import type { AppEnv } from '../config/env.schema';
import { RedisService } from '../redis/redis.service';
import { SapoApiService } from '../sapo/sapo-api.service';
import { SapoService } from '../sapo/sapo.service';
import {
  SNIPPET_NAMES,
  findBadgeAnchor,
  findLoaderAnchor,
  findWidgetAnchors,
  formatLineRanges,
  hasInclude,
  includedSnippets,
  insertIncludeBefore,
  lineCount,
  nearestSafePoint,
  numberedLines,
  removeIncludes,
  safeInsertionPoints,
  snippetKey,
  surroundingLines,
  type Anchor,
  type ThemeTargetKind,
} from './theme-analysis';
import { BADGE_TAG, LOADER_MARKER, WIDGET_MARKER, buildSnippet } from './theme-templates';

const LAYOUT_KEY_RE = /^layouts?\/[^/]+\.bwt$/;
const PRODUCT_KEY_RE =
  /^(?:templates\/product[^/]*|snippets\/product-(?:snippet|detail|page|main|info|content|template)[^/]*)\.bwt$/;
const CARD_KEY_RE =
  /^snippets\/(?:product-item|product-card|product-grid|product-loop|item-product|product-box|product-thumb)[^/]*\.bwt$/;
const MAX_PRODUCT_FILES = 8;
const MAX_CARD_FILES = 8;
const MAX_HINT_FILES = 12;
const MAX_CHAIN_DEPTH = 2;
const PRODUCT_ROOT_KEY = 'templates/product.bwt';
const CHAIN_FOLLOW_RE = /(?:^|[-_])(?:product|pdp|prd|detail|tabs?|info|content|description)(?:$|[-_])/i;
const CHAIN_SKIP_RE =
  /gallery|item|card|option|share|related|price|variant|swatch|breadcrumb|quickview|compare|json|schema|label|badge|review|image|slider|thumb|zoom|together|bought|upsell|recommend|recent|viewed|sticky|flash|deal/i;
const SECONDARY_PRODUCT_TEMPLATE_RE = /^templates\/product\.(?:item_|article|viewed)/;
const LOCK_TTL_SECONDS = 180;
const LIVE_SETTLE_MS = 1500;
const LIQUID_ERROR_RE = /liquid (?:syntax )?error|undefined method|internal server error/i;
const LOADER_PRESENT_RE = /f1genz-storefront|__F1GENZ_STOREFRONT_CONFIG|include\s+['"][^'"]*reviews-loader['"]/i;
const WIDGET_PRESENT_RE = /<f1genz-(?:reviews|qna)[\w-]*[\s>]/i;
const BADGE_PRESENT_RE = /<f1genz-rating-badge[\s>]/i;
const ORDER: Record<ThemeTargetKind, number> = { badge: 0, widget: 1, loader: 2 };

export interface ThemeSummary {
  id: string;
  name: string;
  role: string;
  processing: boolean;
}

export interface PlannedEdit {
  target: ThemeTargetKind;
  file: string;
  status: 'insert' | 'present' | 'skipped';
  source?: 'rule' | 'ai';
  reason: string;
  afterLine?: number;
  preview?: { before: string[]; inserted: string; after: string[] };
  manual?: { instruction: string; code: string };
}

export interface ThemePlan {
  themeId: string;
  themeName: string;
  role: string;
  hash: string;
  edits: PlannedEdit[];
  warnings: string[];
}

interface Insertion {
  target: ThemeTargetKind;
  file: string;
  beforeLine: number;
  content: string;
}

interface InternalPlan extends ThemePlan {
  insertions: Insertion[];
}

export interface ApplyResult {
  themeId: string;
  inserted: PlannedEdit[];
  createdFiles: string[];
  verification: { mode: 'live' | 'readback'; checks: Array<{ name: string; ok: boolean; detail: string }> };
  warnings: string[];
}

export interface ThemeInstallDeps {
  fetch?: typeof fetch;
  settleMs?: number;
}

const sha = (value: string): string => createHash('sha256').update(value).digest('hex');
const normalizeEol = (value: string): string => value.replace(/\r\n/g, '\n');

const sortBySizeDesc = (rows: Array<{ key: string; content: string }>) =>
  [...rows].sort((a, b) => b.content.length - a.content.length);

const collectProductFiles = async (
  keys: string[],
  read: (key: string) => Promise<string | null>,
): Promise<Array<{ key: string; content: string }>> => {
  const keySet = new Set(keys);
  const out: Array<{ key: string; content: string }> = [];
  const seen = new Set<string>();
  const own = new Set(Object.values(SNIPPET_NAMES));
  const queue: Array<{ key: string; depth: number }> = keySet.has(PRODUCT_ROOT_KEY) ? [{ key: PRODUCT_ROOT_KEY, depth: 0 }] : [];
  while (queue.length > 0 && out.length < MAX_PRODUCT_FILES) {
    const { key, depth } = queue.shift() as { key: string; depth: number };
    if (seen.has(key)) continue;
    seen.add(key);
    const content = await read(key);
    if (content === null) continue;
    out.push({ key, content });
    if (depth >= MAX_CHAIN_DEPTH) continue;
    for (const name of includedSnippets(content)) {
      const next = `snippets/${name}.bwt`;
      if (own.has(name) || seen.has(next) || !keySet.has(next)) continue;
      if (!CHAIN_FOLLOW_RE.test(name) || CHAIN_SKIP_RE.test(name)) continue;
      queue.push({ key: next, depth: depth + 1 });
    }
  }
  if (out.length > 0) return out;
  const loose = keys
    .filter((k) => PRODUCT_KEY_RE.test(k) && !SECONDARY_PRODUCT_TEMPLATE_RE.test(k))
    .sort((a, b) => Number(b.startsWith('snippets/')) - Number(a.startsWith('snippets/')))
    .slice(0, MAX_PRODUCT_FILES);
  for (const key of loose) {
    const content = await read(key);
    if (content !== null) out.push({ key, content });
  }
  return out;
};

@Injectable()
export class ThemeInstallService {
  private readonly logger = new Logger(ThemeInstallService.name);
  private readonly http: typeof fetch;
  private readonly settleMs: number;

  constructor(
    @Inject(APP_ENV) private readonly env: AppEnv,
    private readonly sapo: SapoService,
    private readonly sapoApi: SapoApiService,
    private readonly ai: AiService,
    private readonly redis: RedisService,
    deps: ThemeInstallDeps = {},
  ) {
    this.http = deps.fetch ?? ((input, init) => fetch(input, init));
    this.settleMs = deps.settleMs ?? LIVE_SETTLE_MS;
  }

  async listThemes(storeDomain: string): Promise<ThemeSummary[]> {
    const token = await this.sapo.resolveAccessToken(storeDomain);
    const themes = await this.sapoApi.listThemes(storeDomain, token);
    return themes
      .map((t) => ({ id: String(t.id), name: t.name, role: t.role, processing: Boolean(t.processing) }))
      .sort((a, b) => Number(b.role === 'main') - Number(a.role === 'main') || a.name.localeCompare(b.name));
  }

  async plan(storeDomain: string, themeId: string): Promise<ThemePlan> {
    const token = await this.sapo.resolveAccessToken(storeDomain);
    return this.toPublic(await this.buildPlan(storeDomain, token, themeId));
  }

  async apply(storeDomain: string, themeId: string, planHash: string): Promise<ApplyResult> {
    return this.withLock(storeDomain, async () => {
      const token = await this.sapo.resolveAccessToken(storeDomain);
      const plan = await this.buildPlan(storeDomain, token, themeId);
      if (plan.hash !== planHash) {
        throw new ConflictException({
          code: 'plan_changed',
          message: 'Theme đã thay đổi so với bản xem trước. Vui lòng xem lại kế hoạch.',
          plan: this.toPublic(plan),
        });
      }
      const inserted = plan.edits.filter((e) => e.status === 'insert');
      if (plan.insertions.length === 0) {
        return {
          themeId,
          inserted,
          createdFiles: [],
          verification: { mode: 'readback', checks: [] },
          warnings: [...plan.warnings, 'Không có gì để chèn.'],
        };
      }

      const written: Array<{ key: string; original: string }> = [];
      const created: string[] = [];
      const checks: ApplyResult['verification']['checks'] = [];
      const warnings = [...plan.warnings];
      const live = plan.role === 'main';
      try {
        const kinds = [...new Set(plan.insertions.map((i) => i.target))];
        for (const kind of kinds) {
          const key = snippetKey(kind);
          await this.sapoApi.putThemeAsset(
            storeDomain, token, themeId, key,
            buildSnippet(kind, { apiUrl: this.env.API_BASE_URL, storeDomain }),
          );
          created.push(key);
        }
        const ordered = [...plan.insertions].sort((a, b) => ORDER[a.target] - ORDER[b.target]);
        for (const ins of ordered) {
          const current = await this.sapoApi.getThemeAsset(storeDomain, token, themeId, ins.file);
          if (!current || sha(current.value ?? '') !== sha(ins.content)) {
            throw new ConflictException({ code: 'theme_changed', message: `File ${ins.file} vừa được sửa trong lúc cài đặt` });
          }
          const next = insertIncludeBefore(ins.content, ins.beforeLine, SNIPPET_NAMES[ins.target]);
          if (next === null) throw new BadRequestException({ code: 'unsafe_anchor', message: `Vị trí chèn trong ${ins.file} không an toàn` });
          await this.sapoApi.putThemeAsset(storeDomain, token, themeId, ins.file, next);
          written.push({ key: ins.file, original: ins.content });

          const back = await this.sapoApi.getThemeAsset(storeDomain, token, themeId, ins.file);
          const backText = back?.value ?? '';
          const restored = removeIncludes(backText, [SNIPPET_NAMES[ins.target]]).content;
          const readbackOk = hasInclude(backText, SNIPPET_NAMES[ins.target]) && normalizeEol(restored) === normalizeEol(ins.content);
          checks.push({ name: `readback:${ins.file}`, ok: readbackOk, detail: readbackOk ? 'Đọc lại khớp bản gốc cộng một dòng include' : 'Nội dung đọc lại không khớp' });
          if (!readbackOk) throw new BadRequestException({ code: 'readback_mismatch', message: `Nội dung ${ins.file} sau khi ghi không khớp` });

          if (live) {
            const verdict = await this.verifyLive(storeDomain, token, ins.target);
            checks.push(...verdict.checks);
            warnings.push(...verdict.warnings);
            if (!verdict.ok) {
              throw new BadRequestException({ code: 'live_check_failed', message: `Cửa hàng lỗi sau khi sửa ${ins.file}` });
            }
          }
        }
      } catch (error) {
        const failures = await this.rollback(storeDomain, token, themeId, written, created);
        this.logger.warn(`Theme install rolled back store=${storeDomain} theme=${themeId} failures=${failures.length}`);
        const base = error instanceof HttpException ? error.getResponse() : null;
        const detail = typeof base === 'object' && base ? (base as Record<string, unknown>) : { message: error instanceof Error ? error.message : 'unknown' };
        throw new BadRequestException({
          ...detail,
          code: 'install_rolled_back',
          cause: detail.code ?? 'unknown',
          rollbackFailures: failures,
          message: `Cài đặt thất bại và đã khôi phục theme: ${String(detail.message ?? '')}`.trim(),
        });
      }
      this.logger.log(`Theme install ok store=${storeDomain} theme=${themeId} files=${written.length}`);
      return { themeId, inserted, createdFiles: created, verification: { mode: live ? 'live' : 'readback', checks }, warnings };
    });
  }

  async uninstall(storeDomain: string, themeId: string): Promise<{ themeId: string; removedFrom: string[]; deletedFiles: string[] }> {
    return this.withLock(storeDomain, async () => {
      const token = await this.sapo.resolveAccessToken(storeDomain);
      const theme = await this.requireTheme(storeDomain, token, themeId);
      const keys = (await this.sapoApi.listThemeAssets(storeDomain, token, themeId)).map((a) => a.key);
      const names = Object.values(SNIPPET_NAMES);
      const written: Array<{ key: string; original: string }> = [];
      const removedFrom: string[] = [];
      const read = this.reader(storeDomain, token, themeId);
      const chainKeys = (await collectProductFiles(keys, read)).map((f) => f.key);
      const candidates = [...new Set([
        ...keys.filter((k) => LAYOUT_KEY_RE.test(k) || PRODUCT_KEY_RE.test(k) || CARD_KEY_RE.test(k)),
        ...chainKeys,
      ])];
      try {
        for (const key of candidates) {
          const original = (await read(key)) ?? '';
          if (!names.some((n) => hasInclude(original, n))) continue;
          const { content } = removeIncludes(original, names);
          await this.sapoApi.putThemeAsset(storeDomain, token, themeId, key, content);
          written.push({ key, original });
          removedFrom.push(key);
        }
        if (theme.role === 'main' && written.length > 0) {
          const verdict = await this.verifyLive(storeDomain, token, 'loader');
          if (!verdict.ok) throw new BadRequestException({ code: 'live_check_failed', message: 'Cửa hàng lỗi sau khi gỡ' });
        }
      } catch (error) {
        const failures = await this.rollback(storeDomain, token, themeId, written, []);
        throw new BadRequestException({
          code: 'uninstall_rolled_back',
          message: `Gỡ thất bại và đã khôi phục theme: ${error instanceof Error ? error.message : 'unknown'}`,
          rollbackFailures: failures,
        });
      }
      const deletedFiles: string[] = [];
      for (const kind of Object.keys(SNIPPET_NAMES) as ThemeTargetKind[]) {
        const key = snippetKey(kind);
        if (keys.includes(key)) {
          await this.sapoApi.deleteThemeAsset(storeDomain, token, themeId, key);
          deletedFiles.push(key);
        }
      }
      return { themeId, removedFrom, deletedFiles };
    });
  }

  private async withLock<T>(storeDomain: string, run: () => Promise<T>): Promise<T> {
    const key = `lock:theme-install:${storeDomain}`;
    if (!(await this.redis.setNx(key, Date.now(), LOCK_TTL_SECONDS))) {
      throw new ConflictException({ code: 'theme_install_busy', message: 'Đang có một thao tác cài đặt khác. Vui lòng thử lại sau ít phút.' });
    }
    try {
      return await run();
    } finally {
      await this.redis.del(key);
    }
  }

  private async requireTheme(storeDomain: string, token: string, themeId: string) {
    const themes = await this.sapoApi.listThemes(storeDomain, token);
    const theme = themes.find((t) => String(t.id) === themeId);
    if (!theme) throw new NotFoundException({ code: 'theme_not_found', message: 'Không tìm thấy theme' });
    if (theme.processing) throw new ConflictException({ code: 'theme_processing', message: 'Theme đang được xử lý, thử lại sau' });
    return theme;
  }

  private async rollback(
    storeDomain: string, token: string, themeId: string,
    written: Array<{ key: string; original: string }>, created: string[],
  ): Promise<string[]> {
    const failures: string[] = [];
    for (const w of [...written].reverse()) {
      try {
        await this.sapoApi.putThemeAsset(storeDomain, token, themeId, w.key, w.original);
      } catch {
        failures.push(w.key);
      }
    }
    for (const key of created) {
      try {
        await this.sapoApi.deleteThemeAsset(storeDomain, token, themeId, key);
      } catch {
        failures.push(key);
      }
    }
    return failures;
  }

  private toPublic(plan: InternalPlan): ThemePlan {
    return {
      themeId: plan.themeId,
      themeName: plan.themeName,
      role: plan.role,
      hash: plan.hash,
      edits: plan.edits,
      warnings: plan.warnings,
    };
  }

  private manualFor(target: ThemeTargetKind, instruction: string, storeDomain: string): NonNullable<PlannedEdit['manual']> {
    return { instruction, code: buildSnippet(target, { apiUrl: this.env.API_BASE_URL, storeDomain }).trim() };
  }

  private async askAi(storeDomain: string, target: ThemeTargetKind, key: string, content: string): Promise<Anchor | null> {
    try {
      const numbered = numberedLines(content);
      const shown = numbered === '' ? 0 : numbered.split('\n').length;
      const candidates = safeInsertionPoints(content, shown);
      if (candidates.length === 0) return null;
      const suggestion = await this.ai.suggestInsertionLine(storeDomain, {
        target, key, numbered, candidates: formatLineRanges(candidates),
      });
      if (!suggestion) return null;
      const line = nearestSafePoint(content, suggestion.line);
      if (line === null || !candidates.includes(line)) {
        this.logger.warn(`AI anchor rejected store=${storeDomain} target=${target} key=${key} line=${suggestion.line} reason=not_safe_point`);
        return null;
      }
      return { beforeLine: line, reason: `AI đề xuất: ${suggestion.reason || 'vị trí phù hợp'}` };
    } catch {
      return null;
    }
  }

  private reader(storeDomain: string, token: string, themeId: string): (key: string) => Promise<string | null> {
    const cache = new Map<string, string | null>();
    return async (key: string): Promise<string | null> => {
      if (!cache.has(key)) {
        const asset = await this.sapoApi.getThemeAsset(storeDomain, token, themeId, key);
        cache.set(key, asset ? asset.value ?? '' : null);
      }
      return cache.get(key) ?? null;
    };
  }

  private async buildPlan(storeDomain: string, token: string, themeId: string): Promise<InternalPlan> {
    const theme = await this.requireTheme(storeDomain, token, themeId);
    const keys = (await this.sapoApi.listThemeAssets(storeDomain, token, themeId)).map((a) => a.key);
    const read = this.reader(storeDomain, token, themeId);
    const readAll = async (matching: string[]) => {
      const rows: Array<{ key: string; content: string }> = [];
      for (const key of matching) {
        const content = await read(key);
        if (content !== null) rows.push({ key, content });
      }
      return rows;
    };

    const edits: PlannedEdit[] = [];
    const insertions: Insertion[] = [];
    const warnings: string[] = [];
    let usedAi = false;
    const hintFiles = await readAll(
      keys
        .filter((k) => /^snippets\/[^/]*(?:review|f1genz|loader)[^/]*\.bwt$/i.test(k) && !k.startsWith('snippets/f1genz-'))
        .slice(0, MAX_HINT_FILES),
    );
    const hintLoader = hintFiles.find((f) => LOADER_PRESENT_RE.test(f.content)) ?? null;
    const hintWidget = hintFiles.find((f) => WIDGET_PRESENT_RE.test(f.content)) ?? null;
    const live = theme.role === 'main' ? await this.liveSignals(storeDomain, token) : { loader: false, widget: false };

    const addInsert = (target: ThemeTargetKind, file: string, content: string, anchor: Anchor, source: 'rule' | 'ai') => {
      const next = insertIncludeBefore(content, anchor.beforeLine, SNIPPET_NAMES[target]);
      if (next === null || removeIncludes(next, [SNIPPET_NAMES[target]]).content !== content) return false;
      const around = surroundingLines(content, anchor.beforeLine);
      edits.push({
        target, file, status: 'insert', source, reason: anchor.reason, afterLine: anchor.beforeLine,
        preview: { ...around, inserted: `{% include '${SNIPPET_NAMES[target]}' %}` },
      });
      insertions.push({ target, file, beforeLine: anchor.beforeLine, content });
      if (source === 'ai') usedAi = true;
      return true;
    };

    const layouts = await readAll(keys.filter((k) => LAYOUT_KEY_RE.test(k)).sort((a, b) => Number(b.endsWith('theme.bwt')) - Number(a.endsWith('theme.bwt'))));
    const layout = layouts.find((l) => l.content.includes('content_for_layout')) ?? null;
    const loaderManual = this.manualFor('loader', 'Dán vào file layout của theme, ngay trước thẻ đóng </head>.', storeDomain);
    if (!layout) {
      edits.push({ target: 'loader', file: '', status: 'skipped', reason: 'Không tìm thấy file layout của theme.', manual: loaderManual });
    } else if (hasInclude(layout.content, SNIPPET_NAMES.loader) || LOADER_PRESENT_RE.test(layout.content) || hintLoader || live.loader) {
      edits.push({ target: 'loader', file: hintLoader?.key ?? layout.key, status: 'present', reason: 'Theme đã nạp loader của F1GENZ Reviews (layout, snippet tùy biến hoặc HTML cửa hàng)' });
    } else {
      const rule = findLoaderAnchor(layout.content);
      const anchor = rule ?? (await this.askAi(storeDomain, 'loader', layout.key, layout.content));
      if (!anchor || !addInsert('loader', layout.key, layout.content, anchor, rule ? 'rule' : 'ai')) {
        edits.push({ target: 'loader', file: layout.key, status: 'skipped', reason: 'Không xác định được vị trí an toàn trong layout.', manual: loaderManual });
        warnings.push('Không tự gắn được loader vào layout. Dán đoạn mã ở mục Loader trước thẻ đóng </head> của layout.');
      }
    }

    const productFiles = await collectProductFiles(keys, read);
    const widgetPresent =
      productFiles.find((f) => hasInclude(f.content, SNIPPET_NAMES.widget) || WIDGET_PRESENT_RE.test(f.content)) ?? hintWidget;
    const widgetManual = this.manualFor('widget', 'Dán vào template trang sản phẩm, dưới phần mô tả sản phẩm.', storeDomain);
    if (productFiles.length === 0 && !widgetPresent && !live.widget) {
      edits.push({ target: 'widget', file: '', status: 'skipped', reason: 'Không tìm thấy template trang sản phẩm.', manual: widgetManual });
    } else if (widgetPresent || live.widget) {
      edits.push({ target: 'widget', file: widgetPresent?.key ?? '', status: 'present', reason: 'Trang sản phẩm đã có khối đánh giá F1GENZ' });
    } else {
      const ruled = productFiles
        .flatMap((f, order) => findWidgetAnchors(f.content).map((anchor) => ({ f, anchor, order })))
        .sort((a, b) => (a.anchor.rank ?? 0) - (b.anchor.rank ?? 0) || a.order - b.order);
      let done = false;
      let best: (typeof ruled)[number] | null = null;
      for (const candidate of ruled) {
        if (addInsert('widget', candidate.f.key, candidate.f.content, candidate.anchor, 'rule')) {
          done = true;
          best = candidate;
          break;
        }
      }
      if (!done) {
        for (const f of sortBySizeDesc(productFiles).slice(0, 2)) {
          const anchor = await this.askAi(storeDomain, 'widget', f.key, f.content);
          if (anchor && addInsert('widget', f.key, f.content, anchor, 'ai')) {
            done = true;
            break;
          }
        }
      }
      if (!done) {
        edits.push({ target: 'widget', file: '', status: 'skipped', reason: 'Không có vị trí an toàn nào trong template sản phẩm (AI cũng không đề xuất được).', manual: widgetManual });
        warnings.push('Không tự gắn được khối đánh giá vào trang sản phẩm. Dán đoạn mã ở mục Khối đánh giá vào template sản phẩm của theme.');
      }
      if (done && best?.anchor.strong) {
        warnings.push('Theme đang có khối đánh giá cũ. Khối F1GENZ sẽ hiện ngay dưới nó; gỡ khối cũ nếu không muốn hiển thị cả hai.');
      }
      if (done && best && (best.anchor.rank ?? 0) >= 4) {
        warnings.push('Khối đánh giá được đặt cuối template sản phẩm vì không tìm thấy vị trí rõ ràng hơn. Xem bản xem trước và kiểm tra hiển thị trên cửa hàng.');
      }
    }

    const cardFiles = await readAll(keys.filter((k) => CARD_KEY_RE.test(k)).slice(0, MAX_CARD_FILES));
    const badgeManual = this.manualFor('badge', 'Dán vào snippet thẻ sản phẩm của theme, ngay sau tên sản phẩm.', storeDomain);
    if (cardFiles.length === 0) {
      edits.push({ target: 'badge', file: '', status: 'skipped', reason: 'Không tìm thấy snippet thẻ sản phẩm (product-item...).', manual: badgeManual });
    } else {
      const badgeSkips: PlannedEdit[] = [];
      let anyAnchored = false;
      for (const f of cardFiles) {
        if (hasInclude(f.content, SNIPPET_NAMES.badge) || BADGE_PRESENT_RE.test(f.content)) {
          edits.push({ target: 'badge', file: f.key, status: 'present', reason: 'Thẻ sản phẩm đã có badge F1GENZ' });
          anyAnchored = true;
          continue;
        }
        const anchor = findBadgeAnchor(f.content);
        if (anchor && addInsert('badge', f.key, f.content, anchor, 'rule')) {
          anyAnchored = true;
          const legacy = 'Thẻ sản phẩm đang có badge đánh giá cũ của Sapo (sapo-product-reviews-badge). Badge F1GENZ sẽ hiện cạnh nó; gỡ badge cũ nếu không muốn hiển thị cả hai.';
          if (/sapo-product-reviews-badge/.test(f.content) && !warnings.includes(legacy)) warnings.push(legacy);
        } else {
          badgeSkips.push({ target: 'badge', file: f.key, status: 'skipped', reason: 'Không thấy dòng tiêu đề hay khối giá đứng riêng trong thẻ này, nên không tự gắn badge.' });
        }
      }
      let aiBadge = false;
      if (!anyAnchored) {
        const biggest = sortBySizeDesc(cardFiles)[0];
        const anchor = await this.askAi(storeDomain, 'badge', biggest.key, biggest.content);
        if (anchor && addInsert('badge', biggest.key, biggest.content, anchor, 'ai')) {
          aiBadge = true;
          const idx = badgeSkips.findIndex((e) => e.file === biggest.key);
          if (idx !== -1) badgeSkips.splice(idx, 1);
        }
      }
      if (!anyAnchored && !aiBadge && badgeSkips.length > 0) {
        badgeSkips[0].manual = badgeManual;
        warnings.push('Không tự gắn được badge số sao vào thẻ sản phẩm. Dán đoạn mã ở mục Badge vào snippet thẻ sản phẩm của theme.');
      }
      edits.push(...badgeSkips);
    }

    if (theme.role === 'main') warnings.push('Theme đang xuất bản (live): thay đổi hiển thị ngay trên cửa hàng.');
    if (usedAi) warnings.push('Có vị trí do AI đề xuất. Xem kỹ bản xem trước trước khi xác nhận.');
    if (insertions.length === 0 && edits.every((e) => e.status !== 'present')) {
      warnings.push('Không tìm được vị trí chèn tự động. Dùng hướng dẫn kỹ thuật để dán thủ công.');
    }

    const hash = sha(JSON.stringify({
      themeId,
      ins: insertions.map((i) => [i.target, i.file, i.beforeLine, sha(i.content)]),
    }));
    return { themeId, themeName: theme.name, role: theme.role, hash, edits, warnings, insertions };
  }

  private async liveSignals(storeDomain: string, token: string): Promise<{ loader: boolean; widget: boolean }> {
    const body = async (path: string): Promise<string> => {
      try {
        const res = await this.http(`https://${storeDomain}${path}`, {
          redirect: 'follow',
          headers: { 'cache-control': 'no-cache', 'user-agent': 'F1GENZ-ThemeInstall/1.0' },
        });
        return res.status === 200 ? await res.text() : '';
      } catch {
        return '';
      }
    };
    const home = await body('/');
    let product = '';
    try {
      const [first] = await this.sapoApi.getProducts(storeDomain, token, { limit: 1 });
      if (first?.alias) product = await body(`/${first.alias}`);
    } catch {
      product = '';
    }
    return { loader: LOADER_PRESENT_RE.test(home) || LOADER_PRESENT_RE.test(product), widget: WIDGET_PRESENT_RE.test(product) };
  }

  private async verifyLive(
    storeDomain: string, token: string, kind: ThemeTargetKind,
  ): Promise<{ ok: boolean; checks: ApplyResult['verification']['checks']; warnings: string[] }> {
    const checks: ApplyResult['verification']['checks'] = [];
    const warnings: string[] = [];
    let path = '/';
    if (kind === 'widget') {
      const products = await this.sapoApi.getProducts(storeDomain, token, { limit: 1 });
      if (products[0]?.alias) path = `/${products[0].alias}`;
    } else if (kind === 'badge') {
      path = '/collections/all';
    }
    await new Promise((r) => setTimeout(r, this.settleMs));
    const res = await this.http(`https://${storeDomain}${path}`, {
      redirect: 'follow',
      headers: { 'cache-control': 'no-cache', 'user-agent': 'F1GENZ-ThemeInstall/1.0' },
    });
    const body = await res.text();
    const ok = res.status === 200 && !LIQUID_ERROR_RE.test(body);
    checks.push({ name: `live:${path}`, ok, detail: `HTTP ${res.status}${LIQUID_ERROR_RE.test(body) ? ', có lỗi Liquid' : ''}` });
    const marker = kind === 'loader' ? LOADER_MARKER : kind === 'widget' ? WIDGET_MARKER : BADGE_TAG;
    if (ok && !body.includes(marker)) {
      warnings.push(`Chưa thấy ${kind} trong HTML của ${path} (có thể do bộ đệm của Sapo hoặc trang chưa có sản phẩm).`);
    }
    return { ok, checks, warnings };
  }
}
