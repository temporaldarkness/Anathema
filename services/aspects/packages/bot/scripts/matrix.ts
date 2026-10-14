#!/usr/bin/env tsx
/**
 * Матрица N×N партий между колодами пака.
 *
 * Использование:
 *   matrix <packId> <N> [botName] [deck1,deck2,...]
 *
 * Примеры:
 *   matrix azeroth 50 greedy
 *   matrix azeroth 50 heuristic
 *   matrix azeroth 50 heuristic-v3
 *   matrix azeroth 100 heuristic-v3 stormwind,voidflame
 */

import { getDecks } from '@aspects/cards';
import { runSeries } from '../src/sim';
import { GreedyBot } from '../src/greedy';
import { HeuristicBot } from '../src/heuristic';
import type { Bot } from '../src/types';
import { makeBot } from '../src/bot-factory'

interface Cell {
  p1Winrate: number;
  avgTurns: number;
  reasons: Record<string, number>;
  sample: number;
}

function parseArgs(argv: string[]): {
  packId: string;
  n: number;
  botName: BotName;
  deckIds: string[];
  useMulligan: boolean;
} {
  // Флаги.
  const args = argv.slice();
  let useMulligan = false;
  const cleaned: string[] = [];
  for (const a of args) {
    if (a === '--mulligan') useMulligan = true;
    else cleaned.push(a);
  }

  const [packId, nStr, arg3, arg4] = cleaned;
  if (!packId || !nStr) {
    console.error(
      'Usage: matrix <packId> <N> [botName] [deck1,deck2,...] [--mulligan]\n'
    );
    process.exit(1);
  }
  const n = Number.parseInt(nStr, 10);
  if (!Number.isFinite(n) || n <= 0) {
    console.error(`Invalid N: ${nStr}`);
    process.exit(1);
  }

  let botName: BotName = 'greedy';
  let decksArg: string | undefined;

  if (arg3 === undefined) {
    // ничего
  } else if (arg3.includes(',')) {
    decksArg = arg3;
  } else if (true) {
    botName = arg3;
    decksArg = arg4;
  } else {
    console.error(
      `Unknown bot "${arg3}". Known: ${KNOWN_BOTS.join(', ')}\n` +
      `(Если это список колод — раздели их запятыми.)`,
    );
    process.exit(1);
  }

  const allDecks = getDecks(packId);
  const allIds = allDecks.map((d) => d.id);
  const deckIds = decksArg
    ? decksArg.split(',').map((s) => s.trim()).filter(Boolean)
    : allIds;
  for (const id of deckIds) {
    if (!allIds.includes(id)) {
      console.error(
        `Unknown deck "${id}". Available: ${allIds.join(', ')}`,
      );
      process.exit(1);
    }
  }

  return { packId, n, botName, deckIds, useMulligan };
}

function pad(s: string, w: number): string {
  return s.length >= w ? s : s + ' '.repeat(w - s.length);
}

function padRight(s: string, w: number): string {
  return s.length >= w ? s : ' '.repeat(w - s.length) + s;
}

function main(): void {
  const { packId, n, botName, deckIds, useMulligan } = parseArgs(
    process.argv.slice(2),
  );

  const mkBot = (): Bot => makeBot(botName);

  const cellW = 12;
  const labelW = 12;
  const cells = new Map<string, Cell>();
  const total = deckIds.length * deckIds.length;
  let done = 0;
  const started = Date.now();

  console.log(
    `Running matrix with bot="${botName}"${useMulligan ? ' (mulligan on)' : ''} …`,
  );

  for (const p1 of deckIds) {
    for (const p2 of deckIds) {
      const r = runSeries({
        packId,
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

  console.log(`════════════════════════════════════════════════════`);
  console.log(`  Bot:   ${botName}${useMulligan ? ' (+ mulligan)' : ''}`);
  console.log(`  Pack:  ${packId}`);
  console.log(`  Decks: ${deckIds.join(', ')}`);
  console.log(`  Games: ${total * n}`);
  console.log('────────────────────────────────────────────────────');

  const header =
    pad('P1 \\ P2', labelW) +
    '│' +
    deckIds.map((d) => padRight(d, cellW)).join(' ');
  console.log(header);
  console.log(
    '─'.repeat(labelW) +
      '┼' +
      deckIds.map(() => '─'.repeat(cellW)).join(' '),
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
      const off = Math.abs(sum - 1) > 0.10;
      if (off) symmetricOk = false;
      const flag = off ? '  ⚠' : '';
      console.log(
        `  ${pad(deckIds[i], 12)} vs ${pad(deckIds[j], 12)}  ${(sum * 100).toFixed(0).padStart(4)}%${flag}`,
      );
    }
  }
  if (symmetricOk) console.log('  → все симметричны');
  else console.log('  → есть асимметрия — присмотреться');

  console.log('\nПричины побед (по всем матчам):');
  const reasonTotals: Record<string, number> = {};
  for (const c of cells.values()) {
    for (const [k, v] of Object.entries(c.reasons)) {
      reasonTotals[k] = (reasonTotals[k] ?? 0) + v;
    }
  }
  const totalGames = total * n;
  for (const [k, v] of Object.entries(reasonTotals).sort(
    (a, b) => b[1] - a[1],
  )) {
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