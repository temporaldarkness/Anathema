// Запуск: node apps/frontend/scripts/tokenize.mjs
// Заменяет hex-цвета на CSS-переменные в styles/*.css (кроме 00-tokens и themes/*)

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const stylesDir = join(__dirname, '..', 'src', 'styles');

const MAP = {
  // Фоны
  '#0a0c10': 'var(--clr-background)',
  '#0f1115': 'var(--clr-bg-input)',
  '#101317': 'var(--clr-bg-muted)',
  '#14171c': 'var(--clr-element-bg)',
  '#171b21': 'var(--clr-bg-subtle)',
  '#1a1e25': 'var(--clr-surface)',
  '#1c2027': 'var(--clr-surface-hover)',
  '#232831': 'var(--clr-surface-active)',

  // Границы
  '#22262e': 'var(--clr-border)',
  '#2c313a': 'var(--clr-border-strong)',
  '#3a3f47': 'var(--clr-border-hover)',

  // Текст
  '#e6e6e6': 'var(--clr-text)',
  '#d8dbe0': 'var(--clr-text)',
  '#b0b4bb': 'var(--clr-text-soft)',
  '#8a8f99': 'var(--clr-text-muted)',
  '#6b7280': 'var(--clr-text-dim)',
  '#4a4e55': 'var(--clr-text-faint)',
  '#3a3e45': 'var(--clr-text-faint)',

  // Акцент
  '#3b82f6': 'var(--clr-accent)',
  '#1e3a5f': 'var(--clr-accent-dark)',
  '#2d5a8c': 'var(--clr-accent-mid)',
  '#264a78': 'var(--clr-accent-hover)',
  '#8ec5ff': 'var(--clr-accent-light)',
  '#cbe4ff': 'var(--clr-accent-soft)',
  '#1e2a3a': 'var(--clr-accent-bg)',
  '#1a2530': 'var(--clr-accent-bg-2)',

  // Danger
  '#ef4444': 'var(--clr-danger)',
  '#5a1e28': 'var(--clr-danger-dark)',
  '#8c2d3a': 'var(--clr-danger-mid)',
  '#782630': 'var(--clr-danger-hover)',
  '#ff9b9b': 'var(--clr-danger-light)',
  '#ff8b8b': 'var(--clr-danger-light-2)',
  '#ffb3b3': 'var(--clr-danger-light-3)',
  '#6b2c2c': 'var(--clr-danger-border)',
  '#2a1a1a': 'var(--clr-danger-bg)',
  '#4a2020': 'var(--clr-danger-bg-2)',

  // Warning
  '#fbbf24': 'var(--clr-warning)',
  '#fcd34d': 'var(--clr-warning-hover)',
  '#6b542c': 'var(--clr-warning-border)',
  '#a07a2c': 'var(--clr-warning-mid)',
  '#8a6c2c': 'var(--clr-warning-hover-2)',
  '#2a2418': 'var(--clr-warning-bg)',
  '#3a3222': 'var(--clr-warning-bg-2)',
  '#4a3820': 'var(--clr-warning-bg-3)',

  // Success
  '#22c55e': 'var(--clr-success)',

  // Epic
  '#a855f7': 'var(--clr-epic)',
  '#a78bfa': 'var(--clr-epic-light)',
  '#c0a0ff': 'var(--clr-epic-soft)',
  '#1a1526': 'var(--clr-epic-bg)',
  '#2a1f3a': 'var(--clr-epic-bg-2)',
  '#3a2c5a': 'var(--clr-epic-bg-3)',
  '#3a2c2a': 'var(--clr-epic-bg-4)',
  '#3a2a5a': 'var(--clr-epic-border)',
  '#4a3a6a': 'var(--clr-epic-border-2)',
  '#6a4a4a': 'var(--clr-epic-border-3)',

  // Rarity
  '#f59e0b': 'var(--clr-rarity-legendary)',

  // Прочее
  '#16191f': 'var(--clr-tooltip-bg)',
};

const FILES = [
  '01-reset.css',
  '02-layout.css',
  '03-board.css',
  '04-panels.css',
  '05-log.css',
  '06-hand.css',
  '07-tooltip.css',
  '08-overlays.css',
  '09-pages.css',
  '10-v2-shell.css',
];

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const hexes = Object.keys(MAP).map((h) => h.toLowerCase());
const re = new RegExp(`(${hexes.map(escapeRegex).join('|')})`, 'gi');

let totalReplacements = 0;
for (const file of FILES) {
  const path = join(stylesDir, file);
  let content;
  try {
    content = readFileSync(path, 'utf8');
  } catch {
    console.warn(`[skip] ${file} (не найден)`);
    continue;
  }
  let count = 0;
  content = content.replace(re, (match) => {
    const v = MAP[match.toLowerCase()];
    if (!v) return match;
    count++;
    return v;
  });
  if (count > 0) {
    writeFileSync(path, content, 'utf8');
  }
  totalReplacements += count;
  console.log(`[ok] ${file}: ${count} замен`);
}
console.log(`\nВсего заменено: ${totalReplacements}`);