#!/usr/bin/env tsx
/**
 * Матрица N×N партий между пресетами внутри scope.
 *
 * Usage:
 *   matrix <scope> <N> [botName] [deck1,deck2,...] [--mulligan]
 *
 * Примеры:
 *   matrix main 50
 *   matrix classic,throne 50 heuristic-v5-balanced-master
 *   matrix azeroth 100 heuristic-v5-balanced-master stormwind,forsaken
 */

import { decksForScope, resolveScope, listScopes } from '@aspects/cards';
import { makeBot, listAllBotIds } from '@aspects/bot';
import { runSeries } from '../src/runner';
import type { Bot } from '@aspects/bot';

interface Cell {
  p1Winrate: number;
  avgTurns: number;
  reasons: Record<string, number>;
  sample: number;
}

const DEFAULT_BOT = 'heuristic-v5-balanced-master';

function parseArgs(argv: string[]): {
  series: string[];
  scopeStr: string;
  n: number;
  botName: string;
  deckIds: string[];
  useMulligan: boolean;
} {
  const cleaned: string[] = [];
  let useMulligan = false;
  for (const a of argv) {
    if (a === '--mulligan') useMulligan = true;
    else cleaned.push(a);
  }

  const [scopeStr, nStr, arg3, arg4] = cleaned;
  if (!scopeStr || !nStr) {
    console.error(
      'Usage: matrix <scope> <N> [botName] [deck1,deck2,...] [--mulligan]',
    );
    process.exit(1);
  }
  const n = Number.parseInt(nStr, 10);
  if (!Number.isFinite(n) || n <= 0) {
    console.error(`Invalid N: ${nStr}`);
    process.exit(1);
  }

  const series = resolveScope(scopeStr);
  if (series.length === 0) {
    console.error(
      `Empty scope "${scopeStr}". Known: ${listScopes().map((s) => s.id).join(', ')}`,
    );
    process.exit(1);
  }

  const allDecks = decksForScope(scopeStr);
  const allIds = allDecks.map((d) => d.id);

  let botName = DEFAULT_BOT;
  let decksArg: string | undefined;

  if (arg3 === undefined) {
    // ничего
  } else if (arg3.includes(',')) {
    decksArg = arg3;
  } else {
    if (!listAllBotIds().includes(arg3)) {
      console.error(
        `Unknown bot "${arg3}". Known: ${listAllBotIds().join(', ')}`,
      );
      process.exit(1);
    }
    botName = arg3;
    decksArg = arg4;
  }

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

  return { series, scopeStr, n, botName, deckIds, useMulligan };
}

function pad(s: string, w: number): string {
  return s.length >= w ? s : s + ' '.repeat(w - s.length);
}

function padRight(s: string, w: number): string {
  return s.length >= w ? s : ' '.repeat(w - s.length) + s;
}

function main(): void {
  const { series, scopeStr, n, botName, deckIds, useMulligan } = parseArgs(
    process.argv.slice(2),
  );

  const mkBot = (): Bot => makeBot(botName);

  const cellW = 14;
  const labelW = 14;
  const cells = new Map<string, Cell>();
  const total = deckIds.length * deckIds.length;
  let done = 0;
  const started = Date.now();

  console.log(
    `Matrix: scope=[${series.join(', ')}], bot=${botName}${useMulligan ? ', mulligan' : ''} …`,
  );

  for (const p1 of deckIds) {
    for (const p2 of deckIds) {
      const r = runSeries({
        series,
        p1DeckId: p1,
        p2DeckId: p2,
        games: n,
        useMulligan,
        botFactories: { p1: mkBot, p2: mkBot },
      });
      cells.set(`${p1}|${p2}`, {
        p1Winrate: r.p1Wins / r.games,
        avgTurns: r.avgTurns,
        reasons: r.reasons,
        sample: r.games,
      });
      done++;
      process.stdout.write(
        `\r  running ${done}/${total} … (${p1} vs ${p2})          `,
      );
    }
  }
  process.stdout.write('\r');

  console.log('════════════════════════════════════════════════════');
  console.log(`  Bot:   ${botName}${useMulligan ? ' (+ mulligan)' : ''}`);
  console.log(`  Scope: ${scopeStr}  [${series.join(', ')}]`);
  console.log(`  Decks: ${deckIds.join(', ')}`);
  console.log(`  Games: ${total * n}`);
  console.log('────────────────────────────────────────────────────');

  let header = pad('P1 \\ P2', labelW) + '│';
  for (const d of deckIds) header += padRight(d, cellW) + ' ';
  console.log(header);
  console.log(
    '─'.repeat(labelW) + '┼' + deckIds.map(() => '─'.repeat(cellW)).join(' '),
  );

  for (const p1 of deckIds) {
    let row = pad(p1, labelW) + '│';
    for (const p2 of deckIds) {
      const c = cells.get(`${p1}|${p2}`)!;
      const pct = `${(c.p1Winrate * 100).toFixed(0)}%`;
      const t = `${c.avgTurns.toFixed(0)}t`;
      row += padRight(`${pct} (${t})`, cellW) + ' ';
    }
    console.log(row);
  }

  console.log('\nСимметрия пар (ожидание ≈100%):');
  let symmetricOk = true;
  for (let i = 0; i < deckIds.length; i++) {
    for (let j = i + 1; j < deckIds.length; j++) {
      const a = cells.get(`${deckIds[i]}|${deckIds[j]}`)!;
      const b = cells.get(`${deckIds[j]}|${deckIds[i]}`)!;
      const sum = a.p1Winrate + b.p1Winrate;
      const off = Math.abs(sum - 1) > 0.1;
      if (off) symmetricOk = false;
      const flag = off ? '  ⚠' : '';
      console.log(
        `  ${pad(deckIds[i], 12)} vs ${pad(deckIds[j], 12)}  ${(sum * 100).toFixed(0).padStart(4)}%${flag}`,
      );
    }
  }
  if (symmetricOk) console.log('  → все симметричны');
  else console.log('  → есть асимметрия — присмотреться');

  console.log('\nПричины завершения (по всем матчам):');
  const reasonTotals: Record<string, number> = {};
  for (const c of cells.values()) {
    for (const [k, v] of Object.entries(c.reasons)) {
      reasonTotals[k] = (reasonTotals[k] ?? 0) + v;
    }
  }
  const totalGames = total * n;
  for (const [k, v] of Object.entries(reasonTotals).sort((a, b) => b[1] - a[1])) {
    const p = ((v / totalGames) * 100).toFixed(1);
    console.log(`  ${pad(k, 16)} ${v.toString().padStart(6)}  (${p}%)`);
  }

  let turnsSum = 0;
  for (const c of cells.values()) turnsSum += c.avgTurns;
  const overallAvgTurns = turnsSum / cells.size;

  console.log('─'.repeat(52));
  console.log(`  Games total:  ${totalGames}`);
  console.log(`  Avg turns:    ${overallAvgTurns.toFixed(1)}`);
  console.log(`  Time:         ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log('════════════════════════════════════════════════════');
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}