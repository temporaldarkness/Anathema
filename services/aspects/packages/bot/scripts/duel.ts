#!/usr/bin/env tsx
/**
 * A/B-тест двух ботов.
 *
 * Использование:
 *   duel <packId> <N> <botA> <botB> [deck1,deck2,...]
 *
 * Примеры:
 *   duel azeroth 50  heuristic greedy
 *   duel azeroth 100 heuristic greedy stormwind,voidflame
 *   duel azeroth 50  greedy    old
 *
 * Схема:
 *   Для каждой упорядоченной пары колод (d1, d2) играем два зеркальных сета:
 *     X: p1 = botA @ d1, p2 = botB @ d2
 *     Y: p1 = botB @ d1, p2 = botA @ d2
 *   Победы A = X.p1Wins + Y.p2Wins
 *   Победы B = X.p2Wins + Y.p1Wins
 *
 *   За счёт смены стороны и сохранения колоды на месте, преимущество
 *   первого хода и перекос колод взаимно уничтожаются — остаётся
 *   чистая разница силы ботов.
 */

import { getDecks } from '@aspects/cards';
import { runSingleGame } from '../src/sim';
import { GreedyBot } from '../src/greedy';
import { HeuristicBot } from '../src/heuristic';
import type { Bot } from '../src/types';
import { makeBot } from '../src/bot-factory'

// ─────────────────────────── CLI ────────────────────────────

interface Args {
  packId: string;
  n: number;
  botA: string;
  botB: string;
  deckIds: string[];
  useMulligan: boolean;
}

function parseArgs(argv: string[]): Args {
  const args = argv.slice();
  let useMulligan = false;
  const cleaned: string[] = [];
  for (const a of args) {
    if (a === '--mulligan') useMulligan = true;
    else cleaned.push(a);
  }
  const [packId, nStr, botA, botB, decksArg] = cleaned;
  if (!packId || !nStr || !botA || !botB) {
    console.error('Usage: duel <packId> <N> <botA> <botB> [deck1,deck2,...]');
    console.error('Bots:  greedy | heuristic | old');
    process.exit(1);
  }
  const n = Number.parseInt(nStr, 10);
  if (!Number.isFinite(n) || n <= 0) {
    console.error(`Invalid N: ${nStr}`);
    process.exit(1);
  }
  // Проверим, что оба имени ботов валидны, до долгих прогонов.
  try {
    makeBot(botA);
    makeBot(botB);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  const allIds = getDecks(packId).map((d) => d.id);
  const deckIds = decksArg
    ? decksArg.split(',').map((s) => s.trim()).filter(Boolean)
    : allIds;
  for (const id of deckIds) {
    if (!allIds.includes(id)) {
      console.error(
        `Unknown deck "${id}". Available in pack "${packId}": ${allIds.join(', ')}`,
      );
      process.exit(1);
    }
  }
  return { packId, n, botA, botB, deckIds, useMulligan };
}

// ─────────────────────────── helpers ────────────────────────────

function pad(s: string, w: number): string {
  return s.length >= w ? s : s + ' '.repeat(w - s.length);
}

interface SeriesOutcome {
  p1Wins: number;
  p2Wins: number;
  draws: number;
  totalTurns: number;
  totalSteps: number;
  hitLimit: number;
}

function runSeries(
  packId: string,
  d1: string,
  d2: string,
  n: number,
  mkBotP1: () => Bot,
  mkBotP2: () => Bot,
  seedPrefix: string,
  useMulligan: boolean,
): SeriesOutcome {
  const out: SeriesOutcome = {
    p1Wins: 0,
    p2Wins: 0,
    draws: 0,
    totalTurns: 0,
    totalSteps: 0,
    hitLimit: 0,
  };
  for (let i = 0; i < n; i++) {
    const r = runSingleGame(packId, d1, d2, `${seedPrefix}-${i}`, {
      bots: { p1: mkBotP1(), p2: mkBotP2() },
      useMulligan: useMulligan,
    });
    if (r.winner === 'p1') out.p1Wins++;
    else if (r.winner === 'p2') out.p2Wins++;
    else out.draws++;
    out.totalTurns += r.turns;
    out.totalSteps += r.steps;
    if (r.hitLimit) out.hitLimit++;
  }
  return out;
}

// ─────────────────────────── main ────────────────────────────

function main(): void {
  const { packId, n, botA, botB, deckIds, useMulligan } = parseArgs(process.argv.slice(2));

  const mkA = (): Bot => makeBot(botA);
  const mkB = (): Bot => makeBot(botB);

  // Все упорядоченные пары колод, включая зеркала.
  const pairs: Array<[string, string]> = [];
  for (const a of deckIds) for (const b of deckIds) pairs.push([a, b]);

  let winsA = 0;
  let winsB = 0;
  let draws = 0;
  let totalTurns = 0;
  let totalSteps = 0;
  let hitLimit = 0;

  const totalSeries = pairs.length * 2;
  let done = 0;
  const started = Date.now();

  for (const [d1, d2] of pairs) {
    // X: p1 = A, p2 = B
    const x = runSeries(
      packId, d1, d2, n, mkA, mkB,
      `duel-X-${botA}-${botB}-${d1}-${d2}`,
	  useMulligan
    );
    winsA += x.p1Wins;
    winsB += x.p2Wins;
    draws += x.draws;
    totalTurns += x.totalTurns;
    totalSteps += x.totalSteps;
    hitLimit += x.hitLimit;
    done++;
    process.stdout.write(
      `\r  running ${done}/${totalSeries} … (${d1} vs ${d2}, ${botA}@p1)          `,
    );

    // Y: p1 = B, p2 = A
    const y = runSeries(
      packId, d1, d2, n, mkB, mkA,
      `duel-Y-${botA}-${botB}-${d1}-${d2}`,
	  useMulligan
    );
    winsA += y.p2Wins;
    winsB += y.p1Wins;
    draws += y.draws;
    totalTurns += y.totalTurns;
    totalSteps += y.totalSteps;
    hitLimit += y.hitLimit;
    done++;
    process.stdout.write(
      `\r  running ${done}/${totalSeries} … (${d1} vs ${d2}, ${botB}@p2)          `,
    );
  }
  process.stdout.write('\r');

  const totalGames = n * pairs.length * 2;
  const pct = (x: number) => ((x / totalGames) * 100).toFixed(2);
  const decisive = winsA + winsB;

  console.log('══════════════════════════════════════════════════');
  console.log(`  Duel:   ${botA}  vs  ${botB}`);
  console.log(`  Pack:   ${packId}`);
  console.log(`  Decks:  ${deckIds.join(', ')}`);
  console.log(`  Games:  ${totalGames}  (${n} per (pair, orientation))`);
  console.log('──────────────────────────────────────────────────');
  console.log(`  ${pad(botA, 10)} wins:  ${pad(String(winsA), 6)} (${pct(winsA)}%)`);
  console.log(`  ${pad(botB, 10)} wins:  ${pad(String(winsB), 6)} (${pct(winsB)}%)`);
  console.log(`  Draws:            ${pad(String(draws), 6)} (${pct(draws)}%)`);
  console.log('──────────────────────────────────────────────────');
  console.log(`  Avg turns:  ${(totalTurns / totalGames).toFixed(1)}`);
  console.log(`  Avg steps:  ${(totalSteps / totalGames).toFixed(1)}`);
  if (hitLimit > 0) {
    console.log(`  ! hit step limit: ${hitLimit}`);
  }
  console.log('──────────────────────────────────────────────────');

  if (decisive > 0) {
    const pA = winsA / decisive;
    const se = Math.sqrt(0.25 / decisive);
    const z = (pA - 0.5) / se;
    const verdict =
      Math.abs(z) < 1.96
        ? 'не значимо (p > 0.05)'
        : z > 0
          ? `${botA} значимо сильнее`
          : `${botB} значимо сильнее`;
    console.log(
      `  Decisive games: ${decisive}, ${botA} share: ${(pA * 100).toFixed(2)}%, z = ${z.toFixed(2)}`,
    );
    console.log(`  → ${verdict}`);
  } else {
    console.log('  Все партии вничью — сравнить невозможно.');
  }
  console.log('──────────────────────────────────────────────────');
  console.log(`  Time: ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log('══════════════════════════════════════════════════');
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}