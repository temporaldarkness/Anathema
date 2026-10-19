import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CardDefinitionSchema } from '../src/schema.js';
import { relative } from 'node:path';

function getPackDirs(baseDir) {
  const result = [];
  const walk = (dir) => {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (existsSync(join(fullPath, 'meta.json'))) {
          result.push(fullPath);
        } else {
          walk(fullPath);
        }
      }
    }
  };
  walk(baseDir);
  return result;
}

const here = dirname(fileURLToPath(import.meta.url));
const packsDir = join(here, '..', 'src', 'data', 'packs');
const presetsPath = join(here, '..', 'src', 'data', 'presets.json');

let totalCards = 0;
let totalPresets = 0;
let errors = 0;

if (!existsSync(packsDir)) {
  console.error(`✗ Папка ${packsDir} не найдена`);
  process.exit(1);
}

// ─── Общий пул карт всех паков ───
const globalCardIds = new Set<string>();
const globalCardRarity = new Map<string, string>();
const packEntries: Array<{
  packId: string;
  dirName: string;
  cards: any[];
  ids: Set<string>;
}> = [];

// meta.id → имя папки. Ловим коллизии: два пака с одним публичным id
// молча перезапишут друг друга при загрузке.
const seenPackIds = new Map<string, string>();

const packDirs = getPackDirs(packsDir);

for (const fullPath of packDirs) {
  const packName = relative(packsDir, fullPath);
  const cardsPath = join(fullPath, 'cards.json');
  const metaPath = join(fullPath, 'meta.json');
  if (packName.startsWith('_')) continue;

  if (!existsSync(cardsPath)) {
    console.error(`✗ ${packName}: нет cards.json`);
    errors++;
    continue;
  }
  if (!existsSync(metaPath)) {
    console.error(`✗ ${packName}: нет meta.json`);
    errors++;
    continue;
  }

  let cards: any[];
  let meta: any;
  try {
    cards = JSON.parse(readFileSync(cardsPath, 'utf8')) as any[];
  } catch (e) {
    console.error(`✗ ${packName}: cards.json не парсится — ${(e as Error).message}`);
    errors++;
    continue;
  }
  try {
    meta = JSON.parse(readFileSync(metaPath, 'utf8')) as any;
  } catch (e) {
    console.error(`✗ ${packName}: meta.json не парсится — ${(e as Error).message}`);
    errors++;
    continue;
  }

  // meta.id — публичный идентификатор, НЕ обязан совпадать с именем папки.
  // Проверяем только наличие и уникальность.
  if (!meta.id || typeof meta.id !== 'string') {
    console.error(`✗ ${packName}: meta.json без поля "id"`);
    errors++;
    continue;
  }
  if (seenPackIds.has(meta.id)) {
    console.error(
      `✗ ${packName}: meta.id = "${meta.id}" уже занят папкой "${seenPackIds.get(meta.id)}"`,
    );
    errors++;
    continue;
  }
  seenPackIds.set(meta.id, packName);

  const ids = new Set<string>();
  let packOk = 0;
  for (const card of cards) {
    const r = CardDefinitionSchema.safeParse(card);
    if (!r.success) {
      console.error(`✗ ${packName} [${card.id ?? '?'}]:`);
      console.error(JSON.stringify(r.error.format(), null, 2));
      errors++;
      continue;
    }
    if (ids.has(card.id)) {
      console.error(`✗ ${packName} [${card.id}]: дубликат id в паке`);
      errors++;
      continue;
    }
    if (globalCardIds.has(card.id)) {
      console.error(`✗ ${packName} [${card.id}]: дубликат id между паками`);
      errors++;
      continue;
    }
	if (card.series && !card.series.includes(meta.id)) {
      console.error(
        `✗ ${packName} [${card.id}]: series=[${card.series.join(', ')}] не совпадает с meta.id="${meta.id}"`
      );
      errors++;
      continue;
    }
    ids.add(card.id);
    globalCardIds.add(card.id);
    if (card.rarity) globalCardRarity.set(card.id, card.rarity);
    packOk++;
  }
  totalCards += packOk;
  packEntries.push({ packId: meta.id, dirName: packName, cards, ids });

  // Показываем и имя папки, и публичный id — чтобы при отладке
  // сразу было видно, где что.
  const sameName = meta.id === packName ? '' : ` (id=${meta.id})`;
  console.log(`  ${packName}${sameName}: ${packOk} карт`);
}

// ─── Пресеты ───
if (!existsSync(presetsPath)) {
  console.warn('⚠ presets.json не найден');
} else {
  const presets = JSON.parse(readFileSync(presetsPath, 'utf8')) as any[];
  for (const preset of presets) {
    if (!preset.id || !preset.name) {
      console.error('✗ preset без id или name');
      errors++;
      continue;
    }
    if (!Array.isArray(preset.cards) || preset.cards.length !== 30) {
      console.error(
        `✗ preset [${preset.id}]: 30 карт ожидается, есть ${preset.cards?.length ?? 0}`,
      );
      errors++;
      continue;
    }

    for (const cid of preset.cards) {
      if (!globalCardIds.has(cid)) {
        console.error(
          `✗ preset [${preset.id}]: карта "${cid}" не найдена ни в одном паке`,
        );
        errors++;
      }
    }

    const legendCounts = new Map<string, number>();
    for (const cid of preset.cards) {
      if (globalCardRarity.get(cid) === 'legendary') {
        legendCounts.set(cid, (legendCounts.get(cid) ?? 0) + 1);
      }
    }
    for (const [cid, n] of legendCounts) {
      if (n > 1) {
        console.error(`✗ preset [${preset.id}]: ${n} копий легендарки "${cid}"`);
        errors++;
      }
    }

    totalPresets++;
  }
  console.log(`  presets: ${totalPresets}`);
}

console.log('');
console.log(`Паков:          ${packEntries.length}`);
console.log(`Всего карт:     ${totalCards}`);
console.log(`Всего пресетов: ${totalPresets}`);
console.log(`Ошибок:         ${errors}`);

if (errors > 0) process.exit(1);
console.log('✓ Всё валидно.');