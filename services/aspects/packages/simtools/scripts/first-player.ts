#!/usr/bin/env tsx
/**
 * Анализ преимущества первого хода.
 *
 * Usage:
 *   first-player <scope> <N> [deck1,deck2,...]
 */

import { decksForScope, resolveScope, listScopes } from '@aspects/cards';
import { makeBot, listAllBotIds } from '@aspects/bot';
import { runOneGame } from '../src/runner';
import type { Bot } from '@aspects/bot';
import type { PlayerId } from '@aspects/engine';

const DEFAULT_BOT = 'heuristic-v5-balanced-master';

function parseArgs(argv: string[]): {
  scopeStr: string;
  series: string[];
  n: number;
  botName: string;
  deckIds: string[];
} {
  const [scopeStr, nStr, arg3, arg4] = argv;
  if (!scopeStr || !nStr) {
    console.error('Usage: first-player <scope> <N> [botName] [deck1,deck2,...]');
    process.exit(1);
  }
  const series = resolveScope(scopeStr);
  if (series.length === 0) {
    console.error(`Empty scope "${scopeStr}". Known: ${listScopes().map((s) => s.id).join(', ')}`);
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
  return { scopeStr, series, n, botName, deckIds };
}

interface Sample {
  firstPlayer: PlayerId;
  winner: PlayerId | null;
}

function playOne(
  series: string[],
  d1: string,
  d2: string,
  seed: string,
  botName: string,
): Sample {
  const bot = (): Bot => makeBot(botName);
  const r = runOneGame(series, d1, d2, seed, {
    bots: { p1: bot(), p2: bot() },
    useMulligan: false,
  });
  // GameState.firstPlayer — стабильный идентификатор того, кто ходил первым.
  return {
    firstPlayer: r.finalState.firstPlayer,
    winner: r.winner,
  };
}

interface Report {
  games: number;
  p1FirstCount: number;
  p2FirstCount: number;
  firstWins: number;
  secondWins: number;
  draws: number;
}

function analyze(
  series: string[],
  d1: string,
  d2: string,
  n: number,
  botName: string,
): Report {
  const r: Report = {
    games: n,
    p1FirstCount: 0,
    p2FirstCount: 0,
    firstWins: 0,
    secondWins: 0,
    draws: 0,
  };
  for (let i = 0; i < n; i++) {
    const s = playOne(series, d1, d2, `fp-${d1}-${d2}-${i}`, botName);
    if (s.firstPlayer === 'p1') r.p1FirstCount++;
    else r.p2FirstCount++;
    if (s.winner === null) r.draws++;
    else if (s.winner === s.firstPlayer) r.firstWins++;
    else r.secondWins++;
  }
  return r;
}

function pct(x: number, total: number): string {
  return total === 0 ? 'n/a' : ((x / total) * 100).toFixed(1);
}

function printReport(title: string, r: Report): void {
  const decisive = r.firstWins + r.secondWins;
  const firstShare = decisive > 0 ? r.firstWins / decisive : 0.5;
  const se = Math.sqrt(0.25 / Math.max(1, decisive));
  const z = (firstShare - 0.5) / se;

  console.log(`── ${title} ─────────────────────────────────`);
  console.log(`  Games:               ${r.games}`);
  console.log(`  P1 went first:       ${r.p1FirstCount}  (${pct(r.p1FirstCount, r.games)}%)`);
  console.log(`  P2 went first:       ${r.p2FirstCount}  (${pct(r.p2FirstCount, r.games)}%)`);
  console.log('  ── Pure first-mover advantage ──');
  console.log(`  First player wins:   ${r.firstWins}  (${pct(r.firstWins, decisive)}%)`);
  console.log(`  Second player wins:  ${r.secondWins}  (${pct(r.secondWins, decisive)}%)`);
  console.log(`  Draws:               ${r.draws}`);
  console.log(
    `  Advantage:           ${((firstShare - 0.5) * 100).toFixed(1)} п.п.` +
      `  (SE ≈ ${(se * 100).toFixed(1)}%, z = ${z.toFixed(2)})`,
  );
  console.log('');
}

function main(): void {
  const { scopeStr, series, n, botName, deckIds } = parseArgs(process.argv.slice(2));

  console.log('═══════════════════════════════════════════════════');
  console.log(`  First-player analysis`);
  console.log(`  Scope:     ${scopeStr}  [${series.join(', ')}]`);
  console.log(`  Bot:       ${botName}`);
  console.log(`  Decks:     ${deckIds.join(', ')}`);
  console.log(`  Games/pair: ${n}`);
  console.log('═══════════════════════════════════════════════════\n');

  const started = Date.now();
  for (const d of deckIds) {
    printReport(`Mirror: ${d} vs ${d}`, analyze(series, d, d, n, botName));
  }
  if (deckIds.length > 1) {
    console.log('── Cross-matchups (d1 as p1 vs d2 as p2) ──\n');
    for (const d1 of deckIds) {
      for (const d2 of deckIds) {
        if (d1 === d2) continue;
        printReport(`${d1} (p1) vs ${d2} (p2)`, analyze(series, d1, d2, n, botName));
      }
    }
  }
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Time: ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log('═══════════════════════════════════════════════════');
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}