#!/usr/bin/env tsx
/**
 * Мета-отчёт: winrate пресетов, причины побед, avg turns.
 *
 * Usage:
 *   meta-report <scope> <N> [botName] [--mulligan]
 */

import { decksForScope, resolveScope, listScopes, seriesOfDeck } from '@aspects/cards';
import { makeBot, listAllBotIds } from '@aspects/bot';
import { runSeries } from '../src/runner';
import type { Bot } from '@aspects/bot';

const DEFAULT_BOT = 'heuristic-v5-balanced-master';

function parseArgs(argv: string[]) {
  const cleaned: string[] = [];
  let useMulligan = false;
  for (const a of argv) {
    if (a === '--mulligan') useMulligan = true;
    else cleaned.push(a);
  }
  const [scopeStr, nStr, botArg] = cleaned;
  if (!scopeStr || !nStr) {
    console.error('Usage: meta-report <scope> <N> [botName] [--mulligan]');
    process.exit(1);
  }
  const series = resolveScope(scopeStr);
  if (series.length === 0) {
    console.error(`Empty scope "${scopeStr}".`);
    process.exit(1);
  }
  const n = Number.parseInt(nStr, 10);
  if (!Number.isFinite(n) || n <= 0) {
    console.error(`Invalid N: ${nStr}`);
    process.exit(1);
  }
  let botName = DEFAULT_BOT;
  if (botArg) {
    if (!listAllBotIds().includes(botArg)) {
      console.error(`Unknown bot "${botArg}".`);
      process.exit(1);
    }
    botName = botArg;
  }
  return { scopeStr, series, n, botName, useMulligan };
}

function pad(s: string, w: number): string {
  return s.length >= w ? s : s + ' '.repeat(w - s.length);
}

function main(): void {
  const { scopeStr, series, n, botName, useMulligan } = parseArgs(process.argv.slice(2));
  const decks = decksForScope(scopeStr);
  if (decks.length === 0) {
    console.error('No decks in scope.');
    process.exit(1);
  }

  console.log('═══════════════════════════════════════════════════');
  console.log(`  Meta report`);
  console.log(`  Scope: ${scopeStr} [${series.join(', ')}]`);
  console.log(`  Bot:   ${botName}${useMulligan ? ' (+ mulligan)' : ''}`);
  console.log(`  Games: ${n} per pair, ${decks.length} decks`);
  console.log('═══════════════════════════════════════════════════\n');

  const mkBot = (): Bot => makeBot(botName);

  // Агрегаты
  interface DeckAcc {
    deckId: string;
    series: string[];
    games: number;
    wins: number;
    totalTurns: number;
    reasons: Record<string, number>;
  }
  const acc = new Map<string, DeckAcc>();
  for (const d of decks) {
    acc.set(d.id, {
      deckId: d.id,
      series: seriesOfDeck(d.cards),
      games: 0,
      wins: 0,
      totalTurns: 0,
      reasons: {},
    });
  }

  const total = decks.length * decks.length;
  let done = 0;
  const t0 = Date.now();

  for (const p1 of decks) {
    for (const p2 of decks) {
      const r = runSeries({
        series,
        p1DeckId: p1.id,
        p2DeckId: p2.id,
        games: n,
        useMulligan,
        botFactories: { p1: mkBot, p2: mkBot },
      });
      // p1 wins + p2 wins в обе стороны — обновляем аккумуляторы
      const a1 = acc.get(p1.id)!;
      const a2 = acc.get(p2.id)!;
      a1.games += r.p1Wins + r.p2Wins + r.draws;
      a1.wins += r.p1Wins;
      a1.totalTurns += r.avgTurns * r.games;
      for (const [k, v] of Object.entries(r.reasons)) {
        a1.reasons[k] = (a1.reasons[k] ?? 0) + v;
      }
      a2.games += r.p1Wins + r.p2Wins + r.draws;
      a2.wins += r.p2Wins;
      a2.totalTurns += r.avgTurns * r.games;
      for (const [k, v] of Object.entries(r.reasons)) {
        a2.reasons[k] = (a2.reasons[k] ?? 0) + v;
      }
      done++;
      process.stdout.write(`\r  running ${done}/${total} … (${p1.id} vs ${p2.id})          `);
    }
  }
  process.stdout.write('\r');

  const sorted = [...acc.values()].sort((a, b) => b.wins / b.games - a.wins / a.games);

  console.log('─── Winrate по колодам ────────────────────────');
  console.log(
    pad('deck', 14) +
      pad('games', 7) +
      pad('wins', 7) +
      pad('wr', 8) +
      pad('avgT', 6) +
      'series',
  );
  for (const a of sorted) {
    const wr = (a.wins / a.games) * 100;
    const avgT = a.totalTurns / a.games;
    console.log(
      pad(a.deckId, 14) +
        pad(String(a.games), 7) +
        pad(String(a.wins), 7) +
        pad(`${wr.toFixed(1)}%`, 8) +
        pad(avgT.toFixed(1), 6) +
        `[${a.series.join(', ')}]`,
    );
  }

  // ─── Winrate по сериям ───
  console.log('\n─── Winrate серий (по колодам, в которых встречается) ───');
  const seriesAcc = new Map<string, { games: number; wins: number }>();
  for (const a of acc.values()) {
    for (const s of a.series) {
      let sa = seriesAcc.get(s);
      if (!sa) {
        sa = { games: 0, wins: 0 };
        seriesAcc.set(s, sa);
      }
      sa.games += a.games;
      sa.wins += a.wins;
    }
  }
  const sortedSeries = [...seriesAcc.entries()].sort(
    (a, b) => b[1].wins / b[1].games - a[1].wins / a[1].games,
  );
  for (const [s, sa] of sortedSeries) {
    const wr = (sa.wins / sa.games) * 100;
    console.log(`  ${pad(s, 14)} ${pad(String(sa.games), 7)} ${pad(`${wr.toFixed(1)}%`, 8)}`);
  }

  // ─── Причины побед ───
  console.log('\n─── Причины побед (общие) ────────────────────');
  const allReasons: Record<string, number> = {};
  let totalGames = 0;
  for (const a of acc.values()) {
    for (const [k, v] of Object.entries(a.reasons)) {
      allReasons[k] = (allReasons[k] ?? 0) + v;
    }
    totalGames += a.games;
  }
  for (const [k, v] of Object.entries(allReasons).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${pad(k, 16)} ${pad(String(v), 7)} (${((v / totalGames) * 100).toFixed(1)}%)`);
  }

  console.log('─'.repeat(52));
  console.log(`  Games:   ${total * n}`);
  console.log(`  Time:    ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log('═══════════════════════════════════════════════════');
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}