import { createHash } from 'crypto';
import { readFileSync } from 'fs';

const hashOf = (file) => createHash('sha256').update(readFileSync(new URL(`../public/storefront/${file}`, import.meta.url))).digest('hex').slice(0, 10);
const templates = readFileSync(new URL('../src/core/theme-install/theme-templates.ts', import.meta.url), 'utf8');

let failed = 0;
for (const file of ['f1genz-storefront.js', 'f1genz-storefront.css']) {
  const key = file.endsWith('.css') ? 'css' : 'js';
  const match = new RegExp(`${key}: '([0-9a-f]{10})'`).exec(templates);
  const actual = hashOf(file);
  if (!match || match[1] !== actual) {
    console.error(`STOREFRONT_ASSET_VERSION.${key} is ${match ? match[1] : 'missing'} but ${file} hashes to ${actual}; bump it in worker/src/core/theme-install/theme-templates.ts`);
    failed = 1;
  }
}
const schemaBwt = readFileSync(new URL('../../storefront/theme/f1genz-product-schema.bwt', import.meta.url), 'utf8');
const embedded = /SCHEMA_SNIPPET_BODY = `([^`]*)`/.exec(templates);
if (!embedded || embedded[1].trim() !== schemaBwt.trim()) {
  console.error('SCHEMA_SNIPPET_BODY in worker/src/core/theme-install/theme-templates.ts no longer matches storefront/theme/f1genz-product-schema.bwt');
  failed = 1;
}
process.exit(failed);
