import { parseInsertionAnswer } from '../src/core/ai/ai.service';
import { describe, expect, it } from 'vitest';
import {
  findBadgeAnchor,
  findWidgetAnchors,
  findLoaderAnchor,
  findWidgetAnchor,
  insertIncludeBefore,
  isSafePoint,
  removeIncludes,
} from '../src/core/theme-install/theme-analysis';
import { ThemeInstallService } from '../src/core/theme-install/theme-install.service';

const LAYOUT = [
  '<!doctype html>',
  '<html>',
  '<head>',
  '  <title>{{ page_title }}</title>',
  '</head>',
  '<body>',
  '  {{ content_for_layout }}',
  '</body>',
  '</html>',
  '',
].join('\n');

const PRODUCT_SNIPPET = [
  '<div class="product">',
  '  <h1>{{ product.name }}</h1>',
  '  <div class="desc">{{ product.content }}</div>',
  '  {%- include \'product-reviews\' -%}',
  '  {% include \'product-related\' %}',
  '</div>',
  '',
].join('\n');

const CARD = [
  '<div class="card">',
  '  <a href="{{ product.url }}"><img alt="{{ product.name }}" src="{{ product.featured_image | img_url }}"></a>',
  '  <h3 class="title"><a href="{{ product.url }}">{{ product.name }}</a></h3>',
  '  <div class="price">{{ product.price | money }}</div>',
  '</div>',
  '',
].join('\n');

describe('theme-analysis', () => {
  it('rejects insertion points inside for loops, script, style and tag attributes', () => {
    const content = [
      '{% for p in products %}', // 0
      '<div></div>', // 1
      '{% endfor %}', // 2
      '<script>', // 3
      'var a = 1;', // 4
      '</script>', // 5
      '<div class="a"', // 6
      '  data-x="1">', // 7
      '<p>ok</p>', // 8
      '',
    ].join('\n');
    expect(isSafePoint(content, 1)).toBe(false);
    expect(isSafePoint(content, 3)).toBe(true);
    expect(isSafePoint(content, 4)).toBe(false);
    expect(isSafePoint(content, 7)).toBe(false);
    expect(isSafePoint(content, 8)).toBe(true);
  });

  it('treats > inside quoted attributes and liquid as part of the tag', () => {
    const content = ['<a title="a > b"', '   href="{{ x | default: \'>\' }}">', 'text', ''].join('\n');
    expect(isSafePoint(content, 1)).toBe(false);
    expect(isSafePoint(content, 2)).toBe(true);
  });

  it('puts the loader before </head>', () => {
    const anchor = findLoaderAnchor(LAYOUT);
    expect(anchor?.beforeLine).toBe(4);
  });

  it('puts the widget after the existing review include and prefers it over related', () => {
    const anchor = findWidgetAnchor(PRODUCT_SNIPPET);
    expect(anchor).toMatchObject({ beforeLine: 4, strong: true });
  });

  it('falls back to before related products when no review include exists', () => {
    const noReviews = PRODUCT_SNIPPET.replace("  {%- include 'product-reviews' -%}\n", '');
    expect(findWidgetAnchor(noReviews)?.beforeLine).toBe(3);
  });

  it('anchors the badge after the heading with the product name, not the image alt', () => {
    expect(findBadgeAnchor(CARD)?.beforeLine).toBe(3);
  });

  it('falls back to the price block when the heading shares its line with other markup', () => {
    const tight = CARD.replace('</a></h3>', '</a></h3></div>');
    expect(findBadgeAnchor(tight)).toMatchObject({ beforeLine: 3, rank: 1 });
  });

  it('does not place a badge in a placeholder card that never references the product', () => {
    const demo = ['<div class="card">', '  <a href="#"><h3>Product-none-name</h3></a>', '  <div class="price">0đ</div>', '</div>', ''].join('\n');
    expect(findBadgeAnchor(demo)).toBeNull();
  });

  it('anchors the badge after a title element whose tag name is a liquid variable', () => {
    const card = [
      '<div class="card">',
      "  <{{ heading | default: 'h3' }} class=\"card__title\"><a href=\"{{ product.url }}\">{{ product.name | escape }}</a></{{ heading | default: 'h3' }}>",
      '  <div class="card__price">{{ product.price | money }}</div>',
      '</div>',
      '',
    ].join('\n');
    expect(findBadgeAnchor(card)).toMatchObject({ beforeLine: 2, rank: 0 });
  });

  it('anchors the badge after a one-line title element identified by its class, as in DefaultTheme', () => {
    const grid = [
      '<div class="col-item">',
      '  <div class="item-title"> <a href="{{ product.url }}" title="{{ product.name }}">{{ product.name }} </a> </div>',
      '  <div class="item-price">{{ product.price | money }}</div>',
      '</div>',
      '',
    ].join('\n');
    expect(findBadgeAnchor(grid)?.beforeLine).toBe(2);
  });

  it('refuses a class-title badge anchor when the element does not close on its own line', () => {
    const open = ['<div class="item-title">', '  <a href="{{ product.url }}">{{ product.name }}</a>', '</div>', ''].join('\n');
    expect(findBadgeAnchor(open)).toBeNull();
  });

  it('puts the widget after the product description when the theme has no review or related include', () => {
    const product = [
      '<div itemscope>',
      '  <meta itemprop="description" content="{{ product.content | strip_html }}">',
      '  <h1>{{ product.name }}</h1>',
      '  <div class="short">{{ product.content | strip_html | truncatewords: 100 }}</div>',
      '  <div class="std">',
      '    {{ product.content }}',
      '  </div>',
      '</div>',
      '{% for product in collections.all.products %}',
      "  {% include 'product-grid-item' %}",
      '{% endfor %}',
      '',
    ].join('\n');
    const anchor = findWidgetAnchor(product);
    expect(anchor).toMatchObject({ beforeLine: 6 });
    expect(anchor?.strong).toBeUndefined();
  });

  it('indents the include like the anchor line even when the next line is blank', () => {
    const content = "\t\t{%- include 'product-reviews' -%}\n\n<div></div>\n";
    const anchor = findWidgetAnchor(content);
    expect(anchor?.beforeLine).toBe(1);
    expect(insertIncludeBefore(content, anchor?.beforeLine ?? -1, 'f1genz-reviews-widget')).toBe(
      "\t\t{%- include 'product-reviews' -%}\n\t\t{% include 'f1genz-reviews-widget' %}\n\n<div></div>\n",
    );
  });

  it('round-trips insert and remove byte for byte, including CRLF files', () => {
    const crlf = LAYOUT.replace(/\n/g, '\r\n');
    const next = insertIncludeBefore(crlf, 4, 'f1genz-reviews-loader');
    expect(next).toContain("{% include 'f1genz-reviews-loader' %}\r\n</head>");
    expect(removeIncludes(next as string, ['f1genz-reviews-loader']).content).toBe(crlf);
  });

  it('refuses to insert at the end of a file without a trailing newline', () => {
    expect(insertIncludeBefore('<p>a</p>', 1, 'f1genz-reviews-loader')).toBeNull();
  });
});

const STORE = 'demo.mysapo.net';

const makeService = (opts: { role: string; failLiveOn?: string; aiLine?: number | null; files?: Map<string, string> }) => {
  const files =
    opts.files ??
    new Map<string, string>([
      ['layouts/theme.bwt', LAYOUT],
      ['templates/product.bwt', "{%- include 'product-snippet' -%}\n"],
      ['snippets/product-snippet.bwt', PRODUCT_SNIPPET],
      ['snippets/product-item.bwt', CARD],
    ]);
  const log: string[] = [];
  const sapoApi = {
    listThemes: async () => [{ id: 1, name: 'T', role: opts.role, processing: false }],
    listThemeAssets: async () => [...files.keys()].map((key) => ({ key })),
    getThemeAsset: async (_s: string, _t: string, _id: string, key: string) =>
      files.has(key) ? { key, value: files.get(key) } : null,
    putThemeAsset: async (_s: string, _t: string, _id: string, key: string, value: string) => {
      log.push(`put ${key}`);
      files.set(key, value);
    },
    deleteThemeAsset: async (_s: string, _t: string, _id: string, key: string) => {
      log.push(`delete ${key}`);
      files.delete(key);
    },
    getProducts: async () => [{ id: 9, alias: 'ao-thun' }],
  };
  const redisKeys = new Set<string>();
  const redis = {
    setNx: async (key: string) => (redisKeys.has(key) ? false : (redisKeys.add(key), true)),
    del: async (key: string) => (redisKeys.delete(key) ? 1 : 0),
  };
  const aiInputs: Array<{ target: string; key: string; candidates?: string }> = [];
  const ai = {
    suggestInsertionLine: async (_s: string, input: { target: string; key: string; candidates?: string }) => {
      aiInputs.push(input);
      return opts.aiLine ? { line: opts.aiLine, reason: 'test' } : null;
    },
  };
  const fetched: string[] = [];
  const fakeFetch = (async (url: string) => {
    fetched.push(url);
    const path = new URL(url).pathname;
    const failing = opts.failLiveOn !== undefined && path === opts.failLiveOn;
    const body = [...files.values()].join('\n');
    return new Response(failing ? 'Liquid syntax error: boom' : body, { status: failing ? 500 : 200 });
  }) as unknown as typeof fetch;
  const service = new ThemeInstallService(
    { API_BASE_URL: 'https://api.example.dev' } as never,
    { resolveAccessToken: async () => 'tok' } as never,
    sapoApi as never,
    ai as never,
    redis as never,
    { fetch: fakeFetch, settleMs: 0 },
  );
  return { service, files, log, fetched, aiInputs };
};

describe('ThemeInstallService', () => {
  it('plans loader, widget and badge inserts and writes nothing', async () => {
    const { service, log } = makeService({ role: 'unpublished' });
    const plan = await service.plan(STORE, '1');
    const inserts = plan.edits.filter((e) => e.status === 'insert');
    expect(inserts.map((e) => `${e.target}:${e.file}`).sort()).toEqual([
      'badge:snippets/product-item.bwt',
      'loader:layouts/theme.bwt',
      'widget:snippets/product-snippet.bwt',
    ]);
    expect(plan.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(log).toEqual([]);
  });

  it('applies on an unpublished theme: snippets first, one include per file, readback only', async () => {
    const { service, files, log, fetched } = makeService({ role: 'unpublished' });
    const plan = await service.plan(STORE, '1');
    const result = await service.apply(STORE, '1', plan.hash);
    expect(result.verification.mode).toBe('readback');
    expect(fetched).toEqual([]);
    const snippetWrites = log.filter((l) => l.startsWith('put snippets/f1genz-'));
    expect(snippetWrites).toHaveLength(3);
    expect(log.indexOf(snippetWrites[2])).toBeLessThan(log.indexOf('put layouts/theme.bwt'));
    expect(files.get('layouts/theme.bwt')).toContain("{% include 'f1genz-reviews-loader' %}\n</head>");
    expect(files.get('snippets/product-snippet.bwt')).toContain("{% include 'f1genz-reviews-widget' %}");
    expect(files.get('snippets/f1genz-reviews-loader.bwt')).toContain('<!-- f1genz:loader -->');
    const again = await service.plan(STORE, '1');
    expect(again.edits.every((e) => e.status !== 'insert')).toBe(true);
  });

  it('treats an existing F1GENZ panel as an installed widget and warns about the legacy Sapo badge', async () => {
    const { service, files } = makeService({ role: 'unpublished' });
    files.set('snippets/product-snippet.bwt', `${PRODUCT_SNIPPET}<f1genz-reviews-panel product-id="{{ product.id }}"></f1genz-reviews-panel>\n`);
    files.set('snippets/product-item.bwt', CARD.replace('<div class="price">', '<div class="sapo-product-reviews-badge"></div>\n  <div class="price">'));
    const plan = await service.plan(STORE, '1');
    expect(plan.edits.find((e) => e.target === 'widget')).toMatchObject({ status: 'present', file: 'snippets/product-snippet.bwt' });
    expect(plan.warnings.some((w) => w.includes('sapo-product-reviews-badge'))).toBe(true);
  });

  it('skips the loader when a custom review snippet already loads F1GENZ', async () => {
    const { service, files } = makeService({ role: 'unpublished' });
    files.set('snippets/lxs-reviews-loader.bwt', '<script>window.__F1GENZ_STOREFRONT_CONFIG = {};</script>\n');
    const plan = await service.plan(STORE, '1');
    expect(plan.edits.find((e) => e.target === 'loader')).toMatchObject({ status: 'present', file: 'snippets/lxs-reviews-loader.bwt' });
  });

  it('on a live theme treats F1GENZ markup in the rendered storefront as already installed', async () => {
    const { service, files } = makeService({ role: 'main' });
    files.set('snippets/theme-extra.bwt', '<script src="/f1genz-storefront.js"></script><f1genz-reviews product-id="1"></f1genz-reviews>\n');
    const plan = await service.plan(STORE, '1');
    expect(plan.edits.find((e) => e.target === 'loader')?.status).toBe('present');
    expect(plan.edits.find((e) => e.target === 'widget')?.status).toBe('present');
  });

  it('rejects a stale plan hash without writing', async () => {
    const { service, log } = makeService({ role: 'unpublished' });
    await expect(service.apply(STORE, '1', 'a'.repeat(64))).rejects.toMatchObject({
      response: { code: 'plan_changed' },
    });
    expect(log).toEqual([]);
  });

  it('on a live theme checks the storefront after each file and keeps a healthy install', async () => {
    const { service, fetched } = makeService({ role: 'main' });
    const plan = await service.plan(STORE, '1');
    const result = await service.apply(STORE, '1', plan.hash);
    expect(result.verification.mode).toBe('live');
    expect(fetched.slice(-3)).toEqual([
      `https://${STORE}/collections/all`,
      `https://${STORE}/ao-thun`,
      `https://${STORE}/`,
    ]);
    expect(result.verification.checks.every((c) => c.ok)).toBe(true);
  });

  it('rolls back every file and deletes new snippets when the live storefront breaks', async () => {
    const { service, files } = makeService({ role: 'main', failLiveOn: '/ao-thun' });
    const before = new Map(files);
    const plan = await service.plan(STORE, '1');
    await expect(service.apply(STORE, '1', plan.hash)).rejects.toMatchObject({
      response: { code: 'install_rolled_back', cause: 'live_check_failed' },
    });
    expect([...files.keys()].sort()).toEqual([...before.keys()].sort());
    for (const [key, value] of before) expect(files.get(key)).toBe(value);
  });

  it('uninstall removes only our include lines and snippet files', async () => {
    const { service, files } = makeService({ role: 'unpublished' });
    const before = new Map(files);
    await service.apply(STORE, '1', (await service.plan(STORE, '1')).hash);
    const result = await service.uninstall(STORE, '1');
    expect(result.removedFrom.sort()).toEqual([
      'layouts/theme.bwt',
      'snippets/product-item.bwt',
      'snippets/product-snippet.bwt',
    ]);
    expect([...files.keys()].sort()).toEqual([...before.keys()].sort());
    for (const [key, value] of before) expect(files.get(key)).toBe(value);
  });

  it('refuses a second concurrent operation for the same store', async () => {
    const { service } = makeService({ role: 'unpublished' });
    const plan = await service.plan(STORE, '1');
    const [a, b] = await Promise.allSettled([service.apply(STORE, '1', plan.hash), service.apply(STORE, '1', plan.hash)]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual(['fulfilled', 'rejected']);
  });
});

declare global {
  interface ImportMeta {
    glob(pattern: string, options: { query: string; import: string; eager: true }): Record<string, unknown>;
  }
}

const FIXTURE_FILES = import.meta.glob('./fixtures/themes/**/*.bwt', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const fixtureTheme = (name: string): Map<string, string> => {
  const prefix = `./fixtures/themes/${name}/`;
  const files = new Map<string, string>();
  for (const [path, content] of Object.entries(FIXTURE_FILES)) if (path.startsWith(prefix)) files.set(path.slice(prefix.length), content);
  return files;
};

const planOf = async (name: string) => {
  const ctx = makeService({ role: 'unpublished', files: fixtureTheme(name) });
  const plan = await ctx.service.plan(STORE, '1');
  return { ...ctx, plan, edit: (target: string) => plan.edits.filter((e) => e.target === target) };
};

describe('ThemeInstallService on real Sapo themes', () => {
  it('stock DefaultTheme: loader in layout, widget after the description, badge after the one-line item-title', async () => {
    const { edit } = await planOf('default-theme');
    expect(edit('loader')[0]).toMatchObject({ status: 'insert', file: 'layouts/theme.bwt', source: 'rule' });
    expect(edit('widget')[0]).toMatchObject({ status: 'insert', file: 'templates/product.bwt', source: 'rule', reason: 'Ngay sau phần mô tả sản phẩm' });
    expect(edit('badge')).toEqual([expect.objectContaining({ status: 'insert', file: 'snippets/product-grid-item.bwt' })]);
  });

  it('finds product-snippet through templates/product.bwt even when many product.* templates exist', async () => {
    const { edit, plan } = await planOf('seafoods-0717');
    expect(edit('widget')[0]).toMatchObject({ status: 'insert', file: 'snippets/product-snippet.bwt', afterLine: 250 });
    expect(plan.warnings.some((w) => w.includes('khối đánh giá cũ'))).toBe(true);
  });

  it('Nau Atelier: badge after a title element with a variable tag name, widget before the related wrapper', async () => {
    const { edit } = await planOf('nau-atelier');
    expect(edit('badge')[0]).toMatchObject({ status: 'insert', file: 'snippets/product-card.bwt', reason: 'Ngay sau tiêu đề tên sản phẩm trong thẻ sản phẩm' });
    expect(edit('widget')[0]).toMatchObject({ status: 'insert', file: 'templates/product.bwt' });
    expect(edit('widget')[0].preview?.after[0]).toContain('relate-wrap');
  });

  it('S2 Spa: the widget is placed before the {% if %} that toggles the related section, not inside it', async () => {
    const { edit } = await planOf('s2-spa');
    const widget = edit('widget')[0];
    expect(widget).toMatchObject({ status: 'insert', file: 'templates/product.bwt' });
    expect(widget.preview?.after[0]).toContain('settings.product_related_enable');
  });

  it('Purity: a review widget hand-installed in an included tab snippet counts as installed', async () => {
    const { edit } = await planOf('purity');
    expect(edit('widget')).toEqual([expect.objectContaining({ status: 'present', file: 'snippets/product-tabs.bwt' })]);
  });

  it.each(['default-theme', 'seafoods-0717', 'nau-atelier', 's2-spa'])(
    '%s: apply then uninstall restores every file byte for byte and a second plan finds nothing to insert',
    async (name) => {
      const { service, files, plan } = await planOf(name);
      const before = new Map(files);
      await service.apply(STORE, '1', plan.hash);
      const again = await service.plan(STORE, '1');
      expect(again.edits.every((e) => e.status !== 'insert')).toBe(true);
      await service.uninstall(STORE, '1');
      expect([...files.keys()].sort()).toEqual([...before.keys()].sort());
      for (const [key, value] of before) expect(files.get(key)).toBe(value);
    },
  );

  it('never writes a Sapo-incompatible filter or a render tag into the theme', async () => {
    for (const name of ['default-theme', 'seafoods-0717', 'nau-atelier', 's2-spa']) {
      const { service, files, plan } = await planOf(name);
      const before = new Map(files);
      await service.apply(STORE, '1', plan.hash);
      for (const [key, value] of files) {
        if (before.get(key) === value) continue;
        const added = value.split('\n').filter((line) => !(before.get(key) ?? '').split('\n').includes(line)).join('\n');
        expect(added).not.toMatch(/\|\s*slice|\{%-?\s*render\b/);
      }
    }
  });
});

describe('ThemeInstallService fallbacks', () => {
  const stuck = new Map<string, string>([
    ['layouts/theme.bwt', LAYOUT],
    ['templates/product.bwt', '{% for p in product.images %}\n<img src="{{ p.src }}">\n{% endfor %}'],
    ['snippets/product-item.bwt', '<div class="x">{{ product.url }}</div>\n'],
  ]);

  it('tells the merchant what to paste, with the exact code, when no safe position exists', async () => {
    const ctx = makeService({ role: 'unpublished', files: new Map(stuck) });
    const result = await ctx.service.plan(STORE, '1');
    const widget = result.edits.find((e) => e.target === 'widget');
    expect(widget).toMatchObject({ status: 'skipped' });
    expect(widget?.manual?.code).toContain('<f1genz-reviews');
    expect(widget?.manual?.code).toContain('product-id="{{ product.id }}"');
    const badge = result.edits.find((e) => e.target === 'badge');
    expect(badge).toMatchObject({ status: 'skipped' });
    expect(badge?.manual?.code).toContain('<f1genz-rating-badge');
    expect(result.warnings.some((w) => w.includes('Dán đoạn mã'))).toBe(true);
  });

  it('asks the AI only with positions that pass the safety scan and snaps an off-by-one answer to a safe line', async () => {
    const layout = '<script>\nvar a = 1;\n</script>\n{{ content_for_layout }}\n<p>x</p>\n';
    const files = new Map([['layouts/theme.bwt', layout]]);
    const { service, aiInputs } = makeService({ role: 'unpublished', files, aiLine: 2 });
    const plan = await service.plan(STORE, '1');
    const loader = plan.edits.find((e) => e.target === 'loader');
    expect(aiInputs[0].candidates).toBeDefined();
    expect(loader).toMatchObject({ status: 'insert', source: 'ai' });
    expect(isSafePoint(layout, loader?.afterLine ?? -1)).toBe(true);
  });

  it('rejects an AI answer that is not near any safe position', async () => {
    const layout = '{% for i in x %}\n<p>a</p>\n<p>b</p>\n<p>c</p>\n<p>d</p>\n<p>e</p>\n{% endfor %}\n{{ content_for_layout }}\n';
    const { service } = makeService({ role: 'unpublished', files: new Map([['layouts/theme.bwt', layout]]), aiLine: 4 });
    const plan = await service.plan(STORE, '1');
    expect(plan.edits.find((e) => e.target === 'loader')).toMatchObject({ status: 'skipped' });
    expect(plan.edits.find((e) => e.target === 'loader')?.manual?.code).toContain('f1genz-storefront.js');
  });
});

describe('parseInsertionAnswer', () => {
  it.each([
    ['plain JSON text', '{"line": 12, "reason": "sau mô tả"}', 12],
    ['JSON in a code fence', '```json\n{"line": 7, "reason": "x"}\n```', 7],
    ['a JSON object already parsed by Workers AI', { line: 30, reason: 'x' }, 30],
    ['a numeric string', '{"line": "15", "reason": "x"}', 15],
  ])('accepts %s', (_name, answer, line) => {
    expect(parseInsertionAnswer(answer)).toMatchObject({ line });
  });

  it.each([
    ['not sure (0)', '{"line": 0}'],
    ['prose only', 'Tôi nghĩ nên chèn sau mô tả'],
    ['broken JSON', '{"line": 12,'],
    ['negative', { line: -3 }],
    ['fraction', { line: 2.5 }],
    ['nothing', null],
  ])('rejects %s with a reason code', (_name, answer) => {
    expect(parseInsertionAnswer(answer)).toHaveProperty('rejected');
  });
});

describe('widget anchor at the end of the template', () => {
  it('accepts the end of a template whose containers are all closed', () => {
    const content = '<div class="a">\n  <h1>{{ product.name }}</h1>\n</div>\n';
    expect(findWidgetAnchors(content)).toEqual([expect.objectContaining({ beforeLine: 3, rank: 4 })]);
  });

  it('refuses the end of a template that leaves a div open, so the widget cannot land in a wrapper', () => {
    const content = '<div class="a">\n  <h1>{{ product.name }}</h1>\n';
    expect(findWidgetAnchors(content)).toEqual([]);
  });

  it('ignores tags inside script, comments and liquid when counting containers', () => {
    const content = '<div>\n<script>var s = "<div>";</script>\n<!-- <section> -->\n{% if a %}</div>{% endif %}\n';
    expect(findWidgetAnchors(content)).toEqual([expect.objectContaining({ rank: 4, beforeLine: 4 })]);
  });

  it('ranks an element-based related section below the description', () => {
    const content = ['<div>{{ product.content }}</div>', '<section class="pdp-related">', '</section>', ''].join('\n');
    const anchors = findWidgetAnchors(content);
    expect(anchors.map((a) => a.rank)).toEqual([2, 3, 4]);
    expect(anchors[1].reason).toBe('Ngay trước phần tử sản phẩm liên quan');
  });
});
