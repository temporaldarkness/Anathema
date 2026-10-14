import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CardDefinitionSchema } from '../src/schema.js';

const here = dirname(fileURLToPath(import.meta.url));
const packsDir = join(here, '..', 'src', 'data', 'packs');

let totalCards = 0;
let totalDecks = 0;
let errors = 0;

if (!existsSync(packsDir)) {
  console.error(`✗ Папка ${packsDir} не найдена`);
  process.exit(1);
}

for (const packName of readdirSync(packsDir)) {
  const packDir = join(packsDir, packName);
  const cardsPath = join(packDir, 'cards.json');
  const metaPath = join(packDir, 'meta.json');
  const decksPath = join(packDir, 'decks.json');

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
      console.error(`✗ ${packName} [${card.id}]: дубликат id`);
      errors++;
      continue;
    }
    ids.add(card.id);
    packOk++;
  }
  totalCards += packOk;

  if (existsSync(decksPath)) {
    const decks = JSON.parse(readFileSync(decksPath, 'utf8')) as any[];
    for (const deck of decks) {
      if (!deck.id || !deck.name) {
        console.error(`✗ ${packName}/decks: колода без id или name`);
        errors++;
        continue;
      }
      if (!Array.isArray(deck.cards) || deck.cards.length !== 30) {
        console.error(`✗ ${packName}/decks [${deck.id}]: должно быть ровно 30 карт, есть ${deck.cards?.length ?? 0}`);
        errors++;
        continue;
      }
      for (const cid of deck.cards) {
        if (!ids.has(cid)) {
          console.error(`✗ ${packName}/decks [${deck.id}]: карта "${cid}" не найдена в паке`);
          errors++;
        }
      }
      const legendCounts = new Map<string, number>();
      for (const cid of deck.cards) {
        const card = cards.find((c) => c.id === cid);
        if (card?.rarity === 'legendary') {
          legendCounts.set(cid, (legendCounts.get(cid) ?? 0) + 1);
        }
      }
      for (const [cid, n] of legendCounts) {
        if (n > 1) {
          console.error(`✗ ${packName}/decks [${deck.id}]: ${n} копий легендарки "${cid}"`);
          errors++;
        }
      }
      totalDecks++;
    }
  }

  console.log(`  ${packName}: ${packOk} карт, ${existsSync(decksPath) ? JSON.parse(readFileSync(decksPath, 'utf8')).length : 0} колод`);
}

console.log('');
console.log(`Паков:          ${readdirSync(packsDir).length}`);
console.log(`Всего карт:     ${totalCards}`);
console.log(`Всего колод:    ${totalDecks}`);
console.log(`Ошибок:         ${errors}`);

if (errors > 0) process.exit(1);
console.log('✓ Всё валидно.');