#!/usr/bin/env tsx
/**
 * Поиск механических дублей (overlap) между картами.
 *
 * Строит «сигнатуру» карты из её механик: cost, stats, keywords,
 * triggers, effects, targets. Если у двух карт разница в N параметрах
 * (по умолчанию 1) — они считаются пересекающимися.
 *
 * Usage:
 *   card-overlap <scope> [--max-diff N] [--ignore-stats]
 *
 * Пример:
 *   card-overlap main
 *   card-overlap azeroth --max-diff 1
 *   card-overlap main --max-diff 2 --ignore-stats
 */

import type { CardDefinition, Effect } from '@aspects/cards';
import { cardsForScope, resolveScope, listScopes } from '@aspects/cards';

interface Args {
  series: string[];
  scopeStr: string;
  maxDiff: number;
  ignoreStats: boolean;
}

function parseArgs(argv: string[]): Args {
  const cleaned: string[] = [];
  let maxDiff = 1;
  let ignoreStats = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--max-diff') {
      maxDiff = parseInt(argv[++i], 10);
      if (!Number.isFinite(maxDiff)) {
        console.error('Invalid --max-diff');
        process.exit(1);
      }
    } else if (a === '--ignore-stats') {
      ignoreStats = true;
    } else {
      cleaned.push(a);
    }
  }

  const scopeStr = cleaned[0];
  if (!scopeStr) {
    console.error('Usage: card-overlap <scope> [--max-diff N] [--ignore-stats]');
    process.exit(1);
  }
  const series = resolveScope(scopeStr);
  if (series.length === 0) {
    console.error(`Empty scope "${scopeStr}". Known: ${listScopes().map((s) => s.id).join(', ')}`);
    process.exit(1);
  }

  return { scopeStr, series, maxDiff, ignoreStats };
}

// ─── Сигнатура ───

function effectComponents(eff: Effect, prefix = ''): string[] {
  const parts: string[] = [];
  const p = prefix ? `${prefix}:` : '';
  parts.push(`${p}EFF:${eff.kind}`);

  if ('amount' in eff) parts.push(`${p}AMT:${eff.amount}`);
  if ('strength' in eff) parts.push(`${p}STR:${eff.strength}`);
  if ('health' in eff) parts.push(`${p}HP:${eff.health}`);
  if ('count' in eff) parts.push(`${p}CNT:${eff.count}`);
  if ('who' in eff) parts.push(`${p}WHO:${eff.who}`);
  if ('target' in eff) parts.push(`${p}TGT:${eff.target}`);
  if ('destination' in eff) parts.push(`${p}DST:${eff.destination}`);
  if ('to' in eff) parts.push(`${p}TO:${eff.to}`);

  if (eff.kind === 'CHOOSE_TARGETS_THEN') {
    parts.push(`${p}SEL:${eff.selection.from}:${eff.selection.count}`);
    for (const inner of eff.then) {
      parts.push(...effectComponents(inner, prefix ? `${prefix}.THEN` : 'THEN'));
    }
  }

  return parts;
}

function getComponents(def: CardDefinition, ignoreStats: boolean): string[] {
  const comps: string[] = [];

  comps.push(`COST:${def.cost}`);
  if (!ignoreStats) {
    comps.push(`STR:${def.strength}`);
    comps.push(`HP:${def.health}`);
  }

  for (const kw of def.abilities ?? []) {
    comps.push(`KW:${kw}`);
  }

  const triggers = def.triggers ?? [];
  for (const tr of triggers) {
    comps.push(`TRIG:${tr.trigger}`);
    if (tr.oncePerTurn) comps.push(`TRIG_ONCE:${tr.trigger}`);
    if (tr.condition) comps.push(`COND:${tr.condition.kind}`);
    for (const eff of tr.effects) {
      comps.push(...effectComponents(eff, `TRIG_${tr.trigger}`));
    }
  }

  const activated = def.activatedAbilities ?? [];
  for (const act of activated) {
    comps.push(`ACT_COST:${act.cost}`);
    if (act.discardCost) comps.push(`ACT_DISCARD:${act.discardCost}`);
    for (const eff of act.effects) {
      comps.push(...effectComponents(eff, `ACT_${act.id}`));
    }
  }

  return comps;
}

// ─── Сравнение ───

interface DiffResult {
  distance: number;
  onlyA: string[];
  onlyB: string[];
}

function compareComponents(a: string[], b: string[]): DiffResult {
  const setA = new Set(a);
  const setB = new Set(b);
  const onlyA: string[] = [];
  const onlyB: string[] = [];

  for (const item of setA) {
    if (!setB.has(item)) onlyA.push(item);
  }
  for (const item of setB) {
    if (!setA.has(item)) onlyB.push(item);
  }

  return { distance: onlyA.length + onlyB.length, onlyA, onlyB };
}

// ─── main ───

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const cardDefs = cardsForScope(args.series);
  const cards = Object.values(cardDefs).filter(
    (c) => !c.isToken && !c.isClassic,
  );

  console.log('═══════════════════════════════════════════════════');
  console.log(`  Card overlap — scope=[${args.series.join(', ')}]`);
  console.log(`  Cards: ${cards.length}  ·  max-diff: ${args.maxDiff}${args.ignoreStats ? '  ·  ignore-stats' : ''}`);
  console.log('═══════════════════════════════════════════════════\n');

  const components = new Map<string, string[]>();
  for (const card of cards) {
    components.set(card.id, getComponents(card, args.ignoreStats));
  }

  interface Overlap {
    a: CardDefinition;
    b: CardDefinition;
    distance: number;
    onlyA: string[];
    onlyB: string[];
  }
  const overlaps: Overlap[] = [];

  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const a = cards[i];
      const b = cards[j];
      const seriesA = a.series ?? [];
      const seriesB = b.series ?? [];
      if (seriesA.some((s) => seriesB.includes(s))) continue; // skip same-series
      const compA = components.get(a.id)!;
      const compB = components.get(b.id)!;
      const diff = compareComponents(compA, compB);
      if (diff.distance <= args.maxDiff) {
        overlaps.push({
          a, b,
          distance: diff.distance,
          onlyA: diff.onlyA,
          onlyB: diff.onlyB,
        });
      }
    }
  }

  if (overlaps.length === 0) {
    console.log('  Нет пересечений при max-diff =', args.maxDiff);
    console.log('  Попробуй --max-diff 2 или убери --ignore-stats.');
    return;
  }

  overlaps.sort((a, b) => a.distance - b.distance);

  console.log(`  Найдено пар: ${overlaps.length}\n`);

  for (const ov of overlaps) {
    const seriesA = (ov.a.series ?? []).join(',');
    const seriesB = (ov.b.series ?? []).join(',');
    console.log(
      `  [diff=${ov.distance}] ${ov.a.name} (${seriesA})  ≈  ${ov.b.name} (${seriesB})`,
    );
    if (ov.distance > 0) {
      const fmtA = ov.onlyA.filter((c) => !c.includes('TRIG_') && !c.includes('ACT_')).slice(0, 5);
      const fmtB = ov.onlyB.filter((c) => !c.includes('TRIG_') && !c.includes('ACT_')).slice(0, 5);
      if (fmtA.length > 0) console.log(`       - Только у A: ${fmtA.join(', ')}`);
      if (fmtB.length > 0) console.log(`       - Только у B: ${fmtB.join(', ')}`);
    }
  }
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}