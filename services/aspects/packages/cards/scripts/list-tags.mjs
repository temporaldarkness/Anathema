import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const packsDir = join(here, '..', 'src', 'data', 'packs');

const personalities = new Map(); // id -> count
const factions = new Map();      // id -> count
const roles = new Map();         // id -> count

for (const packName of readdirSync(packsDir)) {
  if (packName.startsWith('_')) continue;
  const cardsPath = join(packsDir, packName, 'cards.json');
  if (!existsSync(cardsPath)) continue;

  const cards = JSON.parse(readFileSync(cardsPath, 'utf8'));
  for (const c of cards) {
    if (c.isToken) continue;
    if (c.personalityTag) {
      personalities.set(c.personalityTag, (personalities.get(c.personalityTag) ?? 0) + 1);
    }
    for (const f of c.factions ?? []) {
      factions.set(f, (factions.get(f) ?? 0) + 1);
    }
    for (const r of c.roles ?? []) {
      roles.set(r, (roles.get(r) ?? 0) + 1);
    }
  }
}

const out = {
  personalities: [...personalities.entries()].sort((a, b) => a[0].localeCompare(b[0])),
  factions: [...factions.entries()].sort((a, b) => a[0].localeCompare(b[0])),
  roles: [...roles.entries()].sort((a, b) => a[0].localeCompare(b[0])),
};

writeFileSync(
  join(here, '..', 'tags-report.json'),
  JSON.stringify(out, null, 2),
  'utf8',
);

console.log('Готово: packages/cards/tags-report.json');
console.log('Личностей:', out.personalities.length);
console.log('Фракций:', out.factions.length);
console.log('Ролей:', out.roles.length);