export type ThemeTargetKind = 'loader' | 'widget' | 'badge';

export const SNIPPET_NAMES: Record<ThemeTargetKind, string> = {
  loader: 'f1genz-reviews-loader',
  widget: 'f1genz-reviews-widget',
  badge: 'f1genz-rating-badge-card',
};

export const snippetKey = (kind: ThemeTargetKind): string => `snippets/${SNIPPET_NAMES[kind]}.bwt`;

export interface Anchor {
  beforeLine: number;
  reason: string;
  strong?: boolean;
  rank?: number;
}

type HtmlState = 'text' | 'tag' | 'script' | 'style' | 'comment';

export interface ScanState {
  html: HtmlState;
  blocks: string[];
  balanced: boolean;
}

const UNSAFE_BLOCKS = new Set(['for', 'tablerow', 'capture', 'comment', 'raw']);
const OPEN_BLOCKS = new Set(['if', 'unless', 'case', ...UNSAFE_BLOCKS]);
const CLOSE_BLOCKS: Record<string, string> = {
  endif: 'if',
  endunless: 'unless',
  endcase: 'case',
  endfor: 'for',
  endtablerow: 'tablerow',
  endcapture: 'capture',
  endcomment: 'comment',
  endraw: 'raw',
};

export const scanTo = (content: string, end: number): ScanState => {
  const blocks: string[] = [];
  let html: HtmlState = 'text';
  let balanced = true;
  let rawMode: 'comment' | 'raw' | null = null;
  let quote: string | null = null;
  let tagName = '';
  let tagClosing = false;
  let i = 0;

  while (i < end) {
    const c = content[i];
    if (c === '{' && (content[i + 1] === '%' || content[i + 1] === '{')) {
      const isTag = content[i + 1] === '%';
      const j = content.indexOf(isTag ? '%}' : '}}', i + 2);
      if (j === -1 || j + 2 > end) return { html: 'tag', blocks, balanced: false };
      if (isTag) {
        const name = /^\{%-?\s*(\w+)/.exec(content.slice(i, j + 2))?.[1] ?? '';
        if (rawMode) {
          if ((rawMode === 'comment' && name === 'endcomment') || (rawMode === 'raw' && name === 'endraw')) {
            blocks.pop();
            rawMode = null;
          }
        } else if (name === 'comment' || name === 'raw') {
          blocks.push(name);
          rawMode = name;
        } else if (OPEN_BLOCKS.has(name)) {
          blocks.push(name);
        } else if (CLOSE_BLOCKS[name]) {
          if (blocks[blocks.length - 1] === CLOSE_BLOCKS[name]) blocks.pop();
          else balanced = false;
        }
      }
      i = j + 2;
      continue;
    }
    if (rawMode) {
      i += 1;
      continue;
    }
    if (html === 'text') {
      if (c === '<') {
        if (content.startsWith('<!--', i)) {
          html = 'comment';
          i += 4;
          continue;
        }
        const m = /^<(\/?)([a-zA-Z][\w-]*)/.exec(content.slice(i, i + 40));
        if (m) {
          html = 'tag';
          tagClosing = m[1] === '/';
          tagName = m[2].toLowerCase();
          quote = null;
          i += m[0].length;
          continue;
        }
      }
      i += 1;
    } else if (html === 'tag') {
      if (quote) {
        if (c === quote) quote = null;
      } else if (c === '"' || c === "'") {
        quote = c;
      } else if (c === '>') {
        html = !tagClosing && tagName === 'script' ? 'script' : !tagClosing && tagName === 'style' ? 'style' : 'text';
      }
      i += 1;
    } else if (html === 'comment') {
      if (content.startsWith('-->', i)) {
        html = 'text';
        i += 3;
      } else {
        i += 1;
      }
    } else {
      const closer = html === 'script' ? '</script' : '</style';
      if (content.slice(i, i + closer.length).toLowerCase() === closer) {
        html = 'tag';
        tagClosing = true;
        tagName = html === 'tag' ? closer.slice(2) : '';
        quote = null;
        i += closer.length;
      } else {
        i += 1;
      }
    }
  }
  return { html, blocks, balanced: balanced && rawMode === null };
};

const lineStarts = (content: string): number[] => {
  const starts = [0];
  for (let i = 0; i < content.length; i += 1) if (content[i] === '\n') starts.push(i + 1);
  return starts;
};

export const lineCount = (content: string): number => {
  const starts = lineStarts(content);
  return starts[starts.length - 1] === content.length ? starts.length - 1 : starts.length;
};

const lineIndexAt = (starts: number[], offset: number): number => {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (starts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo;
};

export const lineText = (content: string, index: number): string => {
  const starts = lineStarts(content);
  if (index < 0 || index >= starts.length) return '';
  const end = index + 1 < starts.length ? starts[index + 1] : content.length;
  return content.slice(starts[index], end).replace(/\r?\n$/, '');
};

export const isSafePoint = (content: string, beforeLine: number): boolean => {
  const starts = lineStarts(content);
  const count = lineCount(content);
  if (!Number.isInteger(beforeLine) || beforeLine < 0 || beforeLine > count) return false;
  if (beforeLine === count && starts[count] !== content.length) return false;
  const state = scanTo(content, starts[beforeLine]);
  if (state.html !== 'text' || !state.balanced) return false;
  if (state.blocks.some((b) => UNSAFE_BLOCKS.has(b))) return false;
  return state.blocks[state.blocks.length - 1] !== 'case';
};

const includeRe = (name: string, flags = ''): RegExp =>
  new RegExp(`\\{%-?\\s*include\\s+['"]${name.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}['"]\\s*-?%\\}`, flags);

export const hasInclude = (content: string, name: string): boolean => includeRe(name).test(content);

export const includeLine = (name: string): string => `{% include '${name}' %}`;

export const insertIncludeBefore = (content: string, beforeLine: number, name: string): string | null => {
  if (!isSafePoint(content, beforeLine)) return null;
  const starts = lineStarts(content);
  const count = lineCount(content);
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  let refLine = beforeLine < count ? beforeLine : beforeLine - 1;
  while (refLine > 0 && lineText(content, refLine).trim() === '') refLine -= 1;
  const indent = /^[ \t]*/.exec(lineText(content, Math.max(0, refLine)))?.[0] ?? '';
  const offset = starts[beforeLine];
  return content.slice(0, offset) + indent + includeLine(name) + eol + content.slice(offset);
};

export const removeIncludes = (content: string, names: string[]): { content: string; removed: number } => {
  let next = content;
  let removed = 0;
  for (const name of names) {
    const re = new RegExp(
      `^[ \\t]*${includeRe(name).source}[ \\t]*\\r?\\n?`,
      'gm',
    );
    next = next.replace(re, () => {
      removed += 1;
      return '';
    });
  }
  return { content: next, removed };
};

const checkedAnchor = (content: string, beforeLine: number, reason: string): Anchor | null =>
  isSafePoint(content, beforeLine) ? { beforeLine, reason } : null;

export const findLoaderAnchor = (content: string): Anchor | null => {
  const starts = lineStarts(content);
  const head = content.search(/<\/head\s*>/i);
  if (head !== -1) {
    const anchor = checkedAnchor(content, lineIndexAt(starts, head), 'Trước thẻ </head> của layout');
    if (anchor) return anchor;
  }
  const lower = content.toLowerCase();
  const body = lower.lastIndexOf('</body');
  if (body !== -1) return checkedAnchor(content, lineIndexAt(starts, body), 'Trước thẻ </body> của layout');
  return null;
};

const PRODUCT_REVIEWS_RE = /\{%-?\s*include\s+['"]product-reviews['"]\s*-?%\}/;
const RELATED_RE = /\{%-?\s*include\s+['"][^'"]*(?:related|recommend|upsell|cross-?sell|recently|viewed)[^'"]*['"]/i;
const RELATED_ELEMENT_RE =
  /^\s*<(?:section|div|aside|article|ul)\b[^>]*\b(?:class|id)\s*=\s*["'][^"']*(?:related|relate|recommend|upsell|cross-?sell|recently|viewed)[^"']*["']/i;
const DESCRIPTION_RE = /\{\{\s*product\.(?:content|description|body_html)\s*\}\}/;
const IF_OPEN_LINE_RE = /^\s*\{%-?\s*(?:if|unless)\b[^%]*-?%\}\s*(?:\{%-?\s*assign\b[^%]*-?%\}\s*)*$/;
const TAG_ONLY_LINE_RE = /^\s*(?:\{%-?\s*(?:assign|if|endif|unless|endunless)\b[^%]*-?%\}\s*)+$/;

const sameBlocks = (a: string[], b: string[]): boolean => a.length === b.length && a.every((v, i) => v === b[i]);

const hoistOutOfConditions = (content: string, line: number): number => {
  const starts = lineStarts(content);
  let current = line;
  while (current > 0) {
    const here = scanTo(content, starts[current]).blocks;
    const top = here[here.length - 1];
    if (top !== 'if' && top !== 'unless') return current;
    let k = current - 1;
    while (
      k >= 0 &&
      !IF_OPEN_LINE_RE.test(lineText(content, k)) &&
      (lineText(content, k).trim() === '' || TAG_ONLY_LINE_RE.test(lineText(content, k)))
    ) k -= 1;
    if (k < 0 || !IF_OPEN_LINE_RE.test(lineText(content, k))) return current;
    const before = scanTo(content, starts[k]).blocks;
    const after = scanTo(content, starts[k + 1]).blocks;
    if (after.length !== before.length + 1 || !sameBlocks(after, here)) return current;
    current = k;
  }
  return current;
};

const beforeLineAnchor = (content: string, line: number, reason: string): Anchor | null => {
  const hoisted = hoistOutOfConditions(content, line);
  return checkedAnchor(content, hoisted, reason) ?? checkedAnchor(content, line, reason);
};

const containersBalancedBefore = (content: string, offset: number): boolean => {
  const text = content
    .slice(0, offset)
    .replace(/\{%[\s\S]*?%\}|\{\{[\s\S]*?\}\}/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, '');
  let depth = 0;
  for (const m of text.matchAll(/<(\/?)(div|section|main|article|aside)\b[^>]*?(\/?)>/gi)) {
    if (m[3]) continue;
    depth += m[1] ? -1 : 1;
    if (depth < 0) return false;
  }
  return depth === 0;
};

export const findWidgetAnchors = (content: string): Anchor[] => {
  const count = lineCount(content);
  const found: Anchor[] = [];
  const take = (rank: number, anchor: Anchor | null): boolean => {
    if (!anchor) return false;
    found.push({ ...anchor, rank, ...(rank === 0 ? { strong: true } : {}) });
    return true;
  };
  for (let i = 0; i < count; i += 1) {
    if (PRODUCT_REVIEWS_RE.test(lineText(content, i))) {
      if (take(0, checkedAnchor(content, i + 1, "Ngay sau khối đánh giá có sẵn của theme (include 'product-reviews')"))) break;
    }
  }
  for (let i = 0; i < count; i += 1) {
    if (!RELATED_RE.test(lineText(content, i))) continue;
    if (take(1, beforeLineAnchor(content, i, 'Ngay trước khối sản phẩm liên quan'))) break;
  }
  for (let i = 0; i < count; i += 1) {
    const line = lineText(content, i);
    if (!DESCRIPTION_RE.test(line.replace(/<[^>]*>/g, ''))) continue;
    if (take(2, checkedAnchor(content, i + 1, 'Ngay sau phần mô tả sản phẩm'))) break;
  }
  for (let i = 0; i < count; i += 1) {
    if (!RELATED_ELEMENT_RE.test(lineText(content, i))) continue;
    if (take(3, beforeLineAnchor(content, i, 'Ngay trước phần tử sản phẩm liên quan'))) break;
  }
  const tail = 'Cuối template sản phẩm (không thấy khối đánh giá, liên quan hay mô tả để bám vào)';
  const tailAnchor = checkedAnchor(content, count, tail) ?? checkedAnchor(content, count - 1, tail);
  if (tailAnchor && containersBalancedBefore(content, lineStarts(content)[tailAnchor.beforeLine] ?? content.length)) take(4, tailAnchor);
  return found.sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
};

export const findWidgetAnchor = (content: string): Anchor | null => findWidgetAnchors(content)[0] ?? null;

const HEADING_RE = /<h([1-6])\b[^>]*>[\s\S]{0,600}?\{\{\s*product\.(?:name|title)\b[\s\S]{0,300}?<\/h\1\s*>/gi;
const TITLE_LINE_RE =
  /^\s*<([a-z][a-z0-9]*|\{\{[^}]*\}\})(?=[\s>])[^>]*class\s*=\s*["'][^"']*(?:title|name)[^"']*["'][^>]*>.*\{\{\s*product\.(?:name|title)\b.*<\/\1\s*>\s*$/i;
const PRICE_LINE_RE = /^\s*<(?:div|p|span|ul)\b[^>]*class\s*=\s*["'][^"']*price[^"']*["'][^>]*>/i;

const escapeRe = (value: string): string => value.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');

export const findBadgeAnchor = (content: string): Anchor | null => {
  const starts = lineStarts(content);
  HEADING_RE.lastIndex = 0;
  let match = HEADING_RE.exec(content);
  while (match) {
    if ((match[0].match(/<\/h[1-6]/gi) ?? []).length === 1) {
      const endOffset = match.index + match[0].length;
      const line = lineIndexAt(starts, endOffset - 1);
      const lineEnd = line + 1 < starts.length ? starts[line + 1] : content.length;
      if (content.slice(endOffset, lineEnd).trim() === '') {
        const anchor = checkedAnchor(content, line + 1, 'Ngay sau tiêu đề tên sản phẩm trong thẻ sản phẩm');
        if (anchor) return { ...anchor, rank: 0 };
      }
    }
    HEADING_RE.lastIndex = match.index + 1;
    match = HEADING_RE.exec(content);
  }
  const lines = lineCount(content);
  for (let i = 0; i < lines; i += 1) {
    const line = lineText(content, i);
    const tag = TITLE_LINE_RE.exec(line)?.[1];
    if (!tag) continue;
    const opens = (line.match(new RegExp(`<${escapeRe(tag)}(?=[\\s>])`, 'gi')) ?? []).length;
    const closes = (line.match(new RegExp(`</${escapeRe(tag)}\\s*>`, 'gi')) ?? []).length;
    if (opens !== closes) continue;
    const anchor = checkedAnchor(content, i + 1, 'Ngay sau tiêu đề tên sản phẩm trong thẻ sản phẩm');
    if (anchor) return { ...anchor, rank: 0 };
  }
  if (!/\{\{[^}]*\bproduct\.(?:url|name|title|id)\b/.test(content)) return null;
  for (let i = 0; i < lines; i += 1) {
    if (!PRICE_LINE_RE.test(lineText(content, i))) continue;
    const anchor = checkedAnchor(content, i, 'Ngay trước khối giá (thẻ không có dòng tiêu đề đứng riêng)');
    if (anchor) return { ...anchor, rank: 1 };
  }
  return null;
};

export const numberedLines = (content: string, maxChars = 12000): string => {
  const count = lineCount(content);
  const out: string[] = [];
  let used = 0;
  for (let i = 0; i < count; i += 1) {
    const row = `${i + 1}: ${lineText(content, i).slice(0, 160)}`;
    used += row.length + 1;
    if (used > maxChars) break;
    out.push(row);
  }
  return out.join('\n');
};

export const surroundingLines = (content: string, beforeLine: number, radius = 2): { before: string[]; after: string[] } => {
  const count = lineCount(content);
  const before: string[] = [];
  const after: string[] = [];
  for (let i = Math.max(0, beforeLine - radius); i < beforeLine; i += 1) before.push(lineText(content, i));
  for (let i = beforeLine; i < Math.min(count, beforeLine + radius); i += 1) after.push(lineText(content, i));
  return { before, after };
};

export const includedSnippets = (content: string): string[] => {
  const names = new Set<string>();
  for (const m of content.matchAll(/\{%-?\s*include\s+['"]([^'"]+)['"]/g)) names.add(m[1]);
  return [...names];
};

export const safeInsertionPoints = (content: string, maxLine = Number.POSITIVE_INFINITY): number[] => {
  const last = Math.min(lineCount(content), maxLine);
  const points: number[] = [];
  for (let line = 1; line <= last; line += 1) if (isSafePoint(content, line)) points.push(line);
  return points;
};

export const formatLineRanges = (lines: number[]): string => {
  const parts: string[] = [];
  let i = 0;
  while (i < lines.length) {
    let j = i;
    while (j + 1 < lines.length && lines[j + 1] === lines[j] + 1) j += 1;
    parts.push(j > i ? `${lines[i]}-${lines[j]}` : String(lines[i]));
    i = j + 1;
  }
  return parts.join(',');
};

export const nearestSafePoint = (content: string, line: number, radius = 2): number | null => {
  if (!Number.isInteger(line)) return null;
  for (const delta of [0, 1, -1, 2, -2]) {
    if (Math.abs(delta) > radius) continue;
    if (isSafePoint(content, line + delta)) return line + delta;
  }
  return null;
};
