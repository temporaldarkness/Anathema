#!/usr/bin/env tsx
/**
 * Статистика по keywords: winrate колод с этим keyword vs без.
 *
 * Usage:
 *   keyword-stats <scope> <N> [botName] [deck1,deck2,...] [--mulligan]
 */

import { decksForScope, resolveScope, listScopes, cardsForScope } from '@aspects/cards';
import { makeBot, listAllBotIds } from '@aspects/bot';
import { runOneGameRaw } from '../src/runner';

const DEFAULT_BOT = 'heuristic-v5-balanced-master';

function parseArgs(argv: string[]) {
  const cleaned: string[] = [];
  let useMulligan = false;
  for (const a of argv) {
    if (a === '--mulligan') useMulligan = true;
    else cleaned.push(a);
  }
  const [scopeStr, nStr, arg3, arg4] = cleaned;
  if (!scopeStr || !nStr) {
    console.error('Usage: keyword-stats <scope> <N> [botName] [deck1,deck2,...] [--mulligan]');
    process.exit(1);
  }
  const series = resolveScope(scopeStr);
  if (series.length === 0) {
    console.error(`Empty scope. Known: ${listScopes().map((s) => s.id).join(', ')}`);
    process.exit(1);
  }
  const n = Number.parseInt(nStr, 10);
  if (!Number.isFinite(n) || n <= 0) {
    console.error(`Invalid N: ${nStr}`);
    process.exit(1);
  }
  const botIds = listAllBotIds();
  let botName = DEFAULT_BOT;
  let decksArg: string | undefined;
  if (arg3 === undefined) {
    // ничего
  } else if (arg3.includes(',')) {
    decksArg = arg3;
  } else {
    if (!botIds.includes(arg3)) {
      console.error(`Unknown bot "${arg3}". Known: ${botIds.join(', ')}`);
      process.exit(1);
    }
    botName = arg3;
    decksArg = arg4;
  }
  const allIds = decksForScope(scopeStr).map((d) => d.id);
  const deckIds = decksArg
    ? decksArg.split(',').map((s) => s.trim()).filter(Boolean)
    : allIds;
  for (const id of deckIds) {
    if (!allIds.includes(id)) {
      console.error(`Unknown deck "${id}". Available: ${allIds.join(', ')}`);
      process.exit(1);
    }
  }
  return { scopeStr, series, n, botName, deckIds, useMulligan };
}

function deckKeywords(
  cardIds: string[],
  cardDefs: Record<string, any>,
): Set<string> {
  const out = new Set<string>();
  for (const cid of cardIds) {
    const def = cardDefs[cid];
    if (!def) continue;
    for (const kw of def.abilities ?? []) out.add(kw);
  }
  return out;
}

interface KwAcc {
  keyword: string;
  withGames: number;
  withWins: number;
  withoutGames: number;
  withoutWins: number;
}

function ensure(map: Map<string, KwAcc>, kw: string): KwAcc {
  let a = map.get(kw);
  if (!a) {
    a = { keyword: kw, withGames: 0, withWins: 0, withoutGames: 0, withoutWins: 0 };
    map.set(kw, a);
  }
  return a;
}

function pad(s: string, w: number): string {
  return s.length >= w ? s : s + ' '.repeat(w - s.length);
}

function main(): void {
  const { scopeStr, series, n, botName, deckIds, useMulligan } = parseArgs(
    process.argv.slice(2),
  );
  const cardDefs = cardsForScope(series);
  const decks = decksForScope(scopeStr).filter((d) => deckIds.includes(d.id));

  console.log('═══════════════════════════════════════════════════');
  console.log(`  Keyword stats`);
  console.log(`  Scope:  ${scopeStr} [${series.join(', ')}]`);
  console.log(`  Bot:    ${botName}${useMulligan ? ' (+ mulligan)' : ''}`);
  console.log(`  Decks:  ${deckIds.join(', ')}`);
  console.log(`  Games:  ${n} per pair`);
  console.log('═══════════════════════════════════════════════════\n');

  // 1. Считаем keywords каждой колоды + собираем общий список
  const deckKws = new Map<string, Set<string>>();
  const allKeywords = new Set<string>();
  for (const d of decks) {
    const kws = deckKeywords(d.cards, cardDefs);
    deckKws.set(d.id, kws);
    for (const kw of kws) allKeywords.add(kw);
  }

  console.log('─── Keywords по колодам ───────────────────────');
  for (const d of decks) {
    const kws = [...(deckKws.get(d.id) ?? [])].sort();
    console.log(`  ${pad(d.id, 12)} [${kws.join(', ')}]`);
  }
  console.log('');

  // 2. Играем партии и копим статистику
  const acc = new Map<string, KwAcc>();
  const pairs: Array<[string, string]> = [];
  for (const a of deckIds) for (const b of deckIds) pairs.push([a, b]);

  const total = pairs.length * n;
  let done = 0;
  const t0 = Date.now();

  for (const [d1, d2] of pairs) {
    const cards1 = decks.find((d) => d.id === d1)!.cards;
    const cards2 = decks.find((d) => d.id === d2)!.cards;
    const kws1 = deckKws.get(d1)!;
    const kws2 = deckKws.get(d2)!;

    for (let i = 0; i < n; i++) {
      const seed = `kw-${d1}-${d2}-${i}`;
      const r = runOneGameRaw(series, [...cards1], [...cards2], seed, {
        bots: { p1: makeBot(botName), p2: makeBot(botName) },
        useMulligan,
      });
      if (!r.winner) continue;

      const sides = [
        { kws: kws1, won: r.winner === 'p1' },
        { kws: kws2, won: r.winner === 'p2' },
      ];

      for (const { kws, won } of sides) {
        for (const kw of allKeywords) {
          const a = ensure(acc, kw);
          if (kws.has(kw)) {
            a.withGames++;
            if (won) a.withWins++;
          } else {
            a.withoutGames++;
            if (won) a.withoutWins++;
          }
        }
      }

      done++;
      if (done % 100 === 0) {
        process.stdout.write(`\r  running ${done}/${total} …          `);
      }
    }
  }
  process.stdout.write('\r');

  const rows = [...acc.values()]
    .filter((a) => a.withGames >= 20 && a.withoutGames >= 20)
    .map((a) => {
      const withWr = a.withWins / a.withGames;
      const withoutWr = a.withoutWins / a.withoutGames;
      return { ...a, withWr, withoutWr, delta: withWr - withoutWr };
    })
    .sort((a, b) => b.delta - a.delta);

  console.log('─── Winrate по keyword ────────────────────────');
  console.log(
    pad('keyword', 16) +
      pad('with', 8) +
      pad('n_with', 8) +
      pad('without', 10) +
      pad('n_without', 10) +
      pad('Δ', 9),
  );
  for (const r of rows) {
    console.log(
      pad(r.keyword, 16) +
        pad(`${(r.withWr * 100).toFixed(1)}%`, 8) +
        pad(String(r.withGames), 8) +
        pad(`${(r.withoutWr * 100).toFixed(1)}%`, 10) +
        pad(String(r.withoutGames), 10) +
        pad(`${r.delta >= 0 ? '+' : ''}${(r.delta * 100).toFixed(1)}pp`, 9),
    );
  }

  console.log('');
  console.log('─── Как читать ────────────────────────────────');
  console.log('  Δ > +3pp  — keyword помогает колоде');
  console.log('  Δ ≈ 0    — нейтрален');
  console.log('  Δ < −3pp — keyword вредит (или корреляция с плохими колодами)');
  console.log('');
  console.log(`Time: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}