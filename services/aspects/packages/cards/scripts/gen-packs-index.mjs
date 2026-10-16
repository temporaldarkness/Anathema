// Генерирует src/data/packs-index.generated.ts
// Запускается через prebuild (или вручную: pnpm --filter @aspects/cards gen:packs).

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');                            // packages/cards
const packsDir = join(root, 'src', 'data', 'packs');           // ← здесь
const outFile = join(root, 'src', 'data', 'packs-index.generated.ts');

const dirs = readdirSync(packsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
  .map((d) => d.name)
  .sort();

const entries = [];
const errors = [];
const seenIds = new Map();

for (const dir of dirs) {
  const metaPath = join(packsDir, dir, 'meta.json');
  const cardsPath = join(packsDir, dir, 'cards.json');

  let meta;
  try {
    meta = JSON.parse(readFileSync(metaPath, 'utf8'));
  } catch (e) {
    errors.push(`[${dir}] meta.json: ${e.message}`);
    continue;
  }
  try {
    JSON.parse(readFileSync(cardsPath, 'utf8'));
  } catch (e) {
    errors.push(`[${dir}] cards.json: ${e.message}`);
    continue;
  }

  if (!meta.id || typeof meta.id !== 'string') {
    errors.push(`[${dir}] meta.json без "id"`);
    continue;
  }
  if (seenIds.has(meta.id)) {
    errors.push(`Дубликат id "${meta.id}": "${seenIds.get(meta.id)}" и "${dir}"`);
    continue;
  }
  seenIds.set(meta.id, dir);

  entries.push({ dir, id: meta.id });
}

if (errors.length > 0) {
  console.error('\n❌ Ошибки в packs:');
  for (const err of errors) console.error('  • ' + err);
  process.exit(1);
}

const lines = [];
lines.push('// AUTO-GENERATED. Не редактировать руками.');
lines.push('// Регенерация: pnpm --filter @aspects/cards gen:packs');
lines.push('// Источник: src/data/packs/*/');
lines.push('');

entries.forEach((e, i) => {
  lines.push(`import meta_${i} from './packs/${e.dir}/meta.json';`);
  lines.push(`import cards_${i} from './packs/${e.dir}/cards.json';`);
});
lines.push('');
lines.push('export interface RawPack {');
lines.push('  meta: unknown;');
lines.push('  cards: unknown;');
lines.push('}');
lines.push('');
lines.push('export const PACKS_RAW: RawPack[] = [');
entries.forEach((_, i) => {
  lines.push(`  { meta: meta_${i}, cards: cards_${i} },`);
});
lines.push('];');
lines.push('');

writeFileSync(outFile, lines.join('\n'), 'utf8');
console.log(`✅ ${entries.length} паков → src/data/packs-index.generated.ts`);