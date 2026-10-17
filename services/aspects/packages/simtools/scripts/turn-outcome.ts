#!/usr/bin/env tsx
/**
 * Winrate по длине партии.
 *
 * Usage:
 *   turn-outcome <scope> <N> [botName] [deck1,deck2,...] [--mulligan]
 *
 * Разбивает партии на бакеты по turns и смотрит:
 *   - сколько партий в бакете
 *   - winrate P1
 *   - средний winnerReason
 *   - средний финальный glory победителя
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
    console.error('Usage: turn-outcome <scope> <N> [botName] [deck1,deck2,...] [--mulligan]');
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

interface GameResult {
  turns: number;
  winner: 'p1' | 'p2' | null;
  reason: string | null;
  winnerGlory: number | null;
  loserGlory: number | null;
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
  console.log(`  Turn outcome`);
  console.log(`  Scope:  ${scopeStr} [${series.join(', ')}]`);
  console.log(`  Bot:    ${botName}${useMulligan ? ' (+ mulligan)' : ''}`);
  console.log(`  Decks:  ${deckIds.join(', ')}`);
  console.log(`  Games:  ${n} per pair`);
  console.log('═══════════════════════════════════════════════════\n');

  const pairs: Array<[string, string]> = [];
  for (const a of deckIds) for (const b of deckIds) pairs.push([a, b]);

  const results: GameResult[] = [];
  const total = pairs.length * n;
  let done = 0;
  const t0 = Date.now();

  for (const [d1, d2] of pairs) {
    const cards1 = decks.find((d) => d.id === d1)!.cards;
    const cards2 = decks.find((d) => d.id === d2)!.cards;

    for (let i = 0; i < n; i++) {
      const seed = `to-${d1}-${d2}-${i}`;
      const r = runOneGameRaw(series, [...cards1], [...cards2], seed, {
        bots: { p1: makeBot(botName), p2: makeBot(botName) },
        useMulligan,
      });
      const fs = r.finalState;
      results.push({
        turns: r.turns,
        winner: r.winner,
        reason: r.winnerReason,
        winnerGlory:
          r.winner === 'p1' ? fs.players.p1.glory :
          r.winner === 'p2' ? fs.players.p2.glory : null,
        loserGlory:
          r.winner === 'p1' ? fs.players.p2.glory :
          r.winner === 'p2' ? fs.players.p1.glory : null,
      });

      done++;
      if (done % 100 === 0) {
        process.stdout.write(`\r  running ${done}/${total} …          `);
      }
    }
  }
  process.stdout.write('\r');

  // ─── Гистограмма длины ───
  const buckets = [[10, 14], [15, 19], [20, 24], [25, 29], [30, 34], [35, 39], [40, 44], [45, 60]] as const;
  console.log('─── Winrate по длине партии ───────────────────');
  console.log(
    pad('turns', 10) +
      pad('games', 8) +
      pad('p1_wr', 8) +
      pad('avg_winner_glory', 18) +
      pad('avg_loser_glory', 18) +
      'reasons',
  );

  for (const [lo, hi] of buckets) {
    const inBucket = results.filter((g) => g.turns >= lo && g.turns <= hi);
    if (inBucket.length === 0) continue;
    const p1Wins = inBucket.filter((g) => g.winner === 'p1').length;
    const decisive = inBucket.filter((g) => g.winner !== null).length;
    const p1Wr = decisive > 0 ? p1Wins / decisive : 0;

    const winnerGlories = inBucket
      .map((g) => g.winnerGlory)
      .filter((v): v is number => v !== null);
    const loserGlories = inBucket
      .map((g) => g.loserGlory)
      .filter((v): v is number => v !== null);
    const avgWinner = winnerGlories.length > 0
      ? winnerGlories.reduce((a, b) => a + b, 0) / winnerGlories.length
      : 0;
    const avgLoser = loserGlories.length > 0
      ? loserGlories.reduce((a, b) => a + b, 0) / loserGlories.length
      : 0;

    const reasons: Record<string, number> = {};
    for (const g of inBucket) {
      const r = g.reason ?? 'unknown';
      reasons[r] = (reasons[r] ?? 0) + 1;
    }
    const reasonStr = Object.entries(reasons)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([k, v]) => `${k}:${v}`)
      .join(' ');

    console.log(
      pad(`${lo}–${hi}`, 10) +
        pad(String(inBucket.length), 8) +
        pad(`${(p1Wr * 100).toFixed(1)}%`, 8) +
        pad(avgWinner.toFixed(1), 18) +
        pad(avgLoser.toFixed(1), 18) +
        reasonStr,
    );
  }

  console.log('');
  console.log('─── Как читать ────────────────────────────────');
  console.log('  p1_wr: если меняется сильно — есть преимущество в');
  console.log('  длинных/коротких партиях (асимметрия, не first-mover).');
  console.log('  avg_winner_glory vs avg_loser_glory: разница показывает,');
  console.log('  насколько уверенно закрывалась партия.');
  console.log('');
  console.log(`Time: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}