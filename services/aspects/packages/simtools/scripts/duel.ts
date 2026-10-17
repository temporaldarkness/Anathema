#!/usr/bin/env tsx
/**
 * A/B-тест двух ботов в рамках одного scope.
 *
 * Usage:
 *   duel <scope> <N> <botA> <botB> [deck1,deck2,...] [--mulligan]
 *
 * Схема: для каждой упорядоченной пары колод играем две зеркальные серии
 * (A@p1 vs B@p2, затем B@p1 vs A@p2). Суммируем победы A и B — преимущество
 * первого хода и перекос колод взаимно уничтожаются.
 */

import { decksForScope, resolveScope, listScopes } from '@aspects/cards';
import { makeBot, listAllBotIds } from '@aspects/bot';
import { runSeries } from '../src/runner';
import type { Bot } from '@aspects/bot';

interface Args {
  scopeStr: string;
  series: string[];
  n: number;
  botA: string;
  botB: string;
  deckIds: string[];
  useMulligan: boolean;
}

function parseArgs(argv: string[]): Args {
  const cleaned: string[] = [];
  let useMulligan = false;
  for (const a of argv) {
    if (a === '--mulligan') useMulligan = true;
    else cleaned.push(a);
  }
  const [scopeStr, nStr, botA, botB, decksArg] = cleaned;
  if (!scopeStr || !nStr || !botA || !botB) {
    console.error(
      'Usage: duel <scope> <N> <botA> <botB> [deck1,deck2,...] [--mulligan]',
    );
    process.exit(1);
  }
  const series = resolveScope(scopeStr);
  if (series.length === 0) {
    console.error(
      `Empty scope "${scopeStr}". Known: ${listScopes().map((s) => s.id).join(', ')}`,
    );
    process.exit(1);
  }
  const n = Number.parseInt(nStr, 10);
  if (!Number.isFinite(n) || n <= 0) {
    console.error(`Invalid N: ${nStr}`);
    process.exit(1);
  }
  const botIds = listAllBotIds();
  if (!botIds.includes(botA)) {
    console.error(`Unknown bot "${botA}". Known: ${botIds.join(', ')}`);
    process.exit(1);
  }
  if (!botIds.includes(botB)) {
    console.error(`Unknown bot "${botB}". Known: ${botIds.join(', ')}`);
    process.exit(1);
  }
  const allIds = decksForScope(scopeStr).map((d) => d.id);
  const deckIds = decksArg
    ? decksArg.split(',').map((s) => s.trim()).filter(Boolean)
    : allIds;
  for (const id of deckIds) {
    if (!allIds.includes(id)) {
      console.error(
        `Unknown deck "${id}" in scope [${series.join(', ')}]. Available: ${allIds.join(', ')}`,
      );
      process.exit(1);
    }
  }
  return { scopeStr, series, n, botA, botB, deckIds, useMulligan };
}

function pad(s: string, w: number): string {
  return s.length >= w ? s : s + ' '.repeat(w - s.length);
}

function main(): void {
  const { scopeStr, series, n, botA, botB, deckIds, useMulligan } = parseArgs(
    process.argv.slice(2),
  );

  const mkA = (): Bot => makeBot(botA);
  const mkB = (): Bot => makeBot(botB);

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
    const x = runSeries({
      series,
      p1DeckId: d1,
      p2DeckId: d2,
      games: n,
      useMulligan,
      botFactories: { p1: mkA, p2: mkB },
    });
    winsA += x.p1Wins;
    winsB += x.p2Wins;
    draws += x.draws;
    totalTurns += x.avgTurns * x.games;
    totalSteps += x.avgSteps * x.games;
    hitLimit += x.hitLimitCount;
    done++;
    process.stdout.write(
      `\r  running ${done}/${totalSeries} … (${d1} vs ${d2}, ${botA}@p1)          `,
    );

    // Y: p1 = B, p2 = A (зеркально)
    const y = runSeries({
      series,
      p1DeckId: d1,
      p2DeckId: d2,
      games: n,
      useMulligan,
      botFactories: { p1: mkB, p2: mkA },
    });
    winsA += y.p2Wins;
    winsB += y.p1Wins;
    draws += y.draws;
    totalTurns += y.avgTurns * y.games;
    totalSteps += y.avgSteps * y.games;
    hitLimit += y.hitLimitCount;
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
  console.log(`  Duel:    ${botA}  vs  ${botB}`);
  console.log(`  Scope:   ${scopeStr}  [${series.join(', ')}]`);
  console.log(`  Decks:   ${deckIds.join(', ')}`);
  console.log(`  Games:   ${totalGames}  (${n} per (pair, orientation))`);
  console.log('──────────────────────────────────────────────────');
  console.log(`  ${pad(botA, 10)} wins:  ${pad(String(winsA), 6)} (${pct(winsA)}%)`);
  console.log(`  ${pad(botB, 10)} wins:  ${pad(String(winsB), 6)} (${pct(winsB)}%)`);
  console.log(`  Draws:            ${pad(String(draws), 6)} (${pct(draws)}%)`);
  console.log('──────────────────────────────────────────────────');
  console.log(`  Avg turns:  ${(totalTurns / totalGames).toFixed(1)}`);
  console.log(`  Avg steps:  ${(totalSteps / totalGames).toFixed(1)}`);
  if (hitLimit > 0) console.log(`  ! hit step limit: ${hitLimit}`);
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
      `  Decisive: ${decisive}, ${botA} share: ${(pA * 100).toFixed(2)}%, z = ${z.toFixed(2)}`,
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