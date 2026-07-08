import { accessSync, constants } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const requiredOutputs = [
  'server/dist/main.js',
  'server/dist/app.module.js',
];

const missing = [];
for (const output of requiredOutputs) {
  try {
    accessSync(join(root, output), constants.R_OK);
  } catch {
    missing.push(output);
  }
}

if (missing.length) {
  console.error('Build output verification failed:');
  for (const output of missing) console.error(`- Missing ${output}`);
  process.exit(1);
}

console.log(`Build output verification passed for ${requiredOutputs.length} files.`);
