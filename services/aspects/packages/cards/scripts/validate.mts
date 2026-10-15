import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CardDefinitionSchema } from '../src/schema.js';

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
  cards: any[];
  ids: Set<string>;
}> = [];

for (const packName of readdirSync(packsDir)) {
  if (packName.startsWith('_')) continue;

  const packDir = join(packsDir, packName);
  const cardsPath = join(packDir, 'cards.json');
  const metaPath = join(packDir, 'meta.json');

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

  const cards = JSON.parse(readFileSync(cardsPath, 'utf8')) as any[];
  const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as any;

  if (meta.id !== packName) {
    console.error(`✗ ${packName}: meta.id = "${meta.id}" ≠ имени папки`);
    errors++;
  }

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
    ids.add(card.id);
    globalCardIds.add(card.id);
    if (card.rarity) globalCardRarity.set(card.id, card.rarity);
    packOk++;
  }
  totalCards += packOk;
  packEntries.push({ packId: packName, cards, ids });

  console.log(`  ${packName}: ${packOk} карт`);
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

    // Проверка: все карты существуют в общем пуле
    for (const cid of preset.cards) {
      if (!globalCardIds.has(cid)) {
        console.error(
          `✗ preset [${preset.id}]: карта "${cid}" не найдена ни в одном паке`,
        );
        errors++;
      }
    }

    // Легендарки — не больше 1 копии каждой
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