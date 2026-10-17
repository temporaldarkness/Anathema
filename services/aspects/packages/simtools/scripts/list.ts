#!/usr/bin/env tsx
/**
 * Диагностика: что сейчас есть в системе.
 *
 * Usage:
 *   list                    — все scope + пресеты + боты
 *   list <scope>            — детали по scope
 *   list <scope> <deckId>   — карты колоды
 */

import {
  listScopes,
  getScopeMeta,
  resolveScope,
  cardsForScope,
  decksForScope,
  seriesOfDeck,
} from '@aspects/cards';
import { listAllBotIds } from '@aspects/bot';

function section(title: string): void {
  console.log('═══════════════════════════════════════════════');
  console.log(`  ${title}`);
  console.log('═══════════════════════════════════════════════');
}

function main(): void {
  const [scopeArg, deckId] = process.argv.slice(2);

  if (!scopeArg) {
    section('SCOPES (наборы серий для колодостроения)');
    for (const meta of listScopes()) {
      const decks = decksForScope(meta.id);
      const primaryMark = meta.primary ? ' ★' : '';
      console.log(
        `  ${meta.id.padEnd(10)}${primaryMark} [${meta.series.join(', ')}]`,
      );
      console.log(`      ${meta.description}`);
      console.log(
        `      серий: ${meta.series.length}   пресетов: ${decks.length}`,
      );
      for (const d of decks) {
        console.log(`        · ${d.id.padEnd(14)} "${d.name}"`);
      }
    }
    console.log('');
    console.log('  ★ — основная игра');
    console.log('');
    const bots = listAllBotIds();
    console.log(`  Боты (${bots.length}):`);
    console.log(`    ${bots.join(', ')}`);
    return;
  }

  const series = resolveScope(scopeArg);
  if (series.length === 0) {
    console.error(
      `Empty scope "${scopeArg}". Known: ${listScopes()
        .map((s) => s.id)
        .join(', ')}`,
    );
    process.exit(1);
  }
  const meta = getScopeMeta(scopeArg);
  const decks = decksForScope(scopeArg);

  if (!deckId) {
    section(`Scope "${scopeArg}"`);
    if (meta) {
      console.log(`  Name:        ${meta.name}`);
      console.log(`  Description: ${meta.description}`);
      console.log(`  Primary:     ${meta.primary ? 'да' : 'нет'}`);
    } else {
      console.log('  (custom scope — не из реестра SCOPES)');
    }
    console.log(`  Series:      [${series.join(', ')}]`);
    console.log(`  Decks:       ${decks.length}`);
    console.log('');
    for (const d of decks) {
      const drs = seriesOfDeck(d.cards);
      console.log(`  · ${d.id.padEnd(14)} "${d.name}"`);
      console.log(`      серии колоды: [${drs.join(', ')}]`);
      if (d.description) console.log(`      ${d.description}`);
    }
    return;
  }

  const deck = decks.find((d) => d.id === deckId);
  if (!deck) {
    console.error(
      `Unknown deck "${deckId}" in scope "${scopeArg}". ` +
        `Available: ${decks.map((d) => d.id).join(', ')}`,
    );
    process.exit(1);
  }

  section(`Колода "${deckId}" в scope "${scopeArg}"`);
  console.log(`  Name:        ${deck.name}`);
  console.log(`  Description: ${deck.description ?? ''}`);
  console.log(`  Size:        ${deck.cards.length}`);
  console.log('');

  const allCardsById = cardsForScope(scopeArg);
  const counts = new Map<string, number>();
  for (const cid of deck.cards) {
    counts.set(cid, (counts.get(cid) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [cid, n] of sorted) {
    const def = allCardsById[cid];
    const name = def?.name ?? '?';
    const cost = def?.cost ?? '?';
    console.log(
      `  ${n}× ${cid.padEnd(28)} ${String(cost).padStart(3)}💰  "${name}"`,
    );
  }
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}