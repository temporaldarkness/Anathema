#!/usr/bin/env tsx
/**
 * Разница между двумя пресетами в одном scope.
 * Показывает: cost-кривые, средние статы, распределение keywords.
 *
 * Usage:
 *   deck-diff <scope> <deckA> <deckB>
 */

import { decksForScope, resolveScope, cardsForScope } from '@aspects/cards';

function pad(s: string, w: number): string {
  return s.length >= w ? s : s + ' '.repeat(w - s.length);
}

function statOfDeck(cards: string[], cardDefs: Record<string, any>) {
  const counts = new Map<string, number>();
  const uniqueCounts = new Map<string, number>();
  for (const cid of cards) {
    counts.set(cid, (counts.get(cid) ?? 0) + 1);
    uniqueCounts.set(cid, 1);
  }
  let totalCost = 0;
  let totalStr = 0;
  let totalHp = 0;
  let count = 0;
  const costHist = new Map<number, number>();
  const keywords = new Map<string, number>();
  const rarities = new Map<string, number>();
  const legendaries = new Set<string>();

  for (const [cid, n] of counts) {
    const def = cardDefs[cid];
    if (!def) continue;
    totalCost += def.cost * n;
    totalStr += def.strength * n;
    totalHp += def.health * n;
    count += n;
    costHist.set(def.cost, (costHist.get(def.cost) ?? 0) + n);
    rarities.set(def.rarity, (rarities.get(def.rarity) ?? 0) + n);
    if (def.rarity === 'legendary') legendaries.add(cid);
    for (const kw of def.abilities ?? []) {
      keywords.set(kw, (keywords.get(kw) ?? 0) + n);
    }
  }
  return {
    total: count,
    avgCost: totalCost / count,
    avgStr: totalStr / count,
    avgHp: totalHp / count,
    costHist,
    keywords,
    rarities,
    legendaries,
    counts,
    uniqueCounts,
  };
}

function main(): void {
  const [scopeStr, deckAId, deckBId] = process.argv.slice(2);
  if (!scopeStr || !deckAId || !deckBId) {
    console.error('Usage: deck-diff <scope> <deckA> <deckB>');
    process.exit(1);
  }
  const series = resolveScope(scopeStr);
  if (series.length === 0) {
    console.error(`Empty scope "${scopeStr}".`);
    process.exit(1);
  }
  const decks = decksForScope(scopeStr);
  const A = decks.find((d) => d.id === deckAId);
  const B = decks.find((d) => d.id === deckBId);
  if (!A || !B) {
    console.error(`Unknown deck. Available: ${decks.map((d) => d.id).join(', ')}`);
    process.exit(1);
  }

  const cardDefs = cardsForScope(scopeStr);
  const sA = statOfDeck(A.cards, cardDefs);
  const sB = statOfDeck(B.cards, cardDefs);

  console.log('═══════════════════════════════════════════════════');
  console.log(`  Deck diff: ${A.name}  vs  ${B.name}`);
  console.log('═══════════════════════════════════════════════════\n');

  console.log('─── Средние метрики ────────────────────────────');
  console.log(`  ${pad('метрика', 16)} ${pad(A.id, 12)} ${pad(B.id, 12)} ${pad('разница', 12)}`);
  const row = (label: string, a: number, b: number, digits = 2) => {
    const diff = b - a;
    const sign = diff >= 0 ? '+' : '';
    console.log(
      `  ${pad(label, 16)} ${pad(a.toFixed(digits), 12)} ${pad(b.toFixed(digits), 12)} ${pad(sign + diff.toFixed(digits), 12)}`,
    );
  };
  row('avg cost', sA.avgCost, sB.avgCost);
  row('avg strength', sA.avgStr, sB.avgStr);
  row('avg health', sA.avgHp, sB.avgHp);
  row('cards', sA.total, sB.total, 0);
  row('unique', sA.uniqueCounts.size, sB.uniqueCounts.size, 0);
  row('legendaries', sA.legendaries.size, sB.legendaries.size, 0);

  console.log('\n─── Cost кривая ────────────────────────────────');
  console.log(`  ${pad('cost', 8)} ${pad(A.id, 12)} ${pad(B.id, 12)}`);
  for (let i = 0; i <= 10; i++) {
    const a = sA.costHist.get(i) ?? 0;
    const b = sB.costHist.get(i) ?? 0;
    if (a === 0 && b === 0) continue;
    console.log(`  ${pad(String(i), 8)} ${pad(`${a} (${((a / sA.total) * 100).toFixed(0)}%)`, 12)} ${pad(`${b} (${((b / sB.total) * 100).toFixed(0)}%)`, 12)}`);
  }

  console.log('\n─── Keywords ───────────────────────────────────');
  const allKws = new Set([...sA.keywords.keys(), ...sB.keywords.keys()]);
  const sortedKws = [...allKws].sort((a, b) => {
    const va = (sA.keywords.get(a) ?? 0) - (sB.keywords.get(a) ?? 0);
    const vb = (sB.keywords.get(b) ?? 0) - (sA.keywords.get(b) ?? 0);
    return vb - va;
  });
  console.log(`  ${pad('keyword', 16)} ${pad(A.id, 12)} ${pad(B.id, 12)}`);
  for (const kw of sortedKws) {
    const a = sA.keywords.get(kw) ?? 0;
    const b = sB.keywords.get(kw) ?? 0;
    console.log(`  ${pad(kw, 16)} ${pad(String(a), 12)} ${pad(String(b), 12)}`);
  }

  console.log('\n─── Карты только в одной колоде ────────────────');
  const onlyA: string[] = [];
  const onlyB: string[] = [];
  for (const cid of sA.counts.keys()) {
    if (!sB.counts.has(cid)) onlyA.push(cid);
  }
  for (const cid of sB.counts.keys()) {
    if (!sA.counts.has(cid)) onlyB.push(cid);
  }
  console.log(`  Только в "${A.name}":`);
  for (const cid of onlyA) {
    const def = cardDefs[cid];
    const n = sA.counts.get(cid) ?? 0;
    console.log(`    ${n}× ${pad(def?.name ?? cid, 26)} (${def?.cost ?? '?'}💰)`);
  }
  console.log(`  Только в "${B.name}":`);
  for (const cid of onlyB) {
    const def = cardDefs[cid];
    const n = sB.counts.get(cid) ?? 0;
    console.log(`    ${n}× ${pad(def?.name ?? cid, 26)} (${def?.cost ?? '?'}💰)`);
  }

  console.log('');
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}