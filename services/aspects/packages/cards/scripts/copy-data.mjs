import { cpSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', 'src', 'data');
const dst = join(here, '..', 'dist', 'data');

if (existsSync(src)) {
  cpSync(src, dst, { recursive: true });
  console.log('✓ data/ скопирован в dist/');
}