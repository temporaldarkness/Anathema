#!/usr/bin/env tsx
/**
 * Board state timeline: сколько карт на доске по ходам,
 * суммарная сила, HP, занятость слотов.
 *
 * Usage:
 *   board-state-timeline <scope> <N> [botName] [deck1,deck2,...] [--mulligan]
 */

import type { GameState, PlayerId } from '@aspects/engine';
import { strength, health } from '@aspects/engine';
import { decksForScope, resolveScope, listScopes } from '@aspects/cards';
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
    console.error('Usage: board-state-timeline <scope> <N> [botName] [deck1,deck2,...] [--mulligan]');
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

// ─── Snapshot per turn ───

interface TurnSnapshot {
  turn: number;
  activePlayer: PlayerId;
  p1FrontCount: number;
  p2FrontCount: number;
  p1ReserveCount: number;
  p2ReserveCount: number;
  p1FrontStrength: number;
  p2FrontStrength: number;
  p1FrontHp: number;
  p2FrontHp: number;
  p1Neutrals: number;
  p2Neutrals: number;
}

function snapshotState(state: GameState): TurnSnapshot {
  let p1FrontCount = 0;
  let p2FrontCount = 0;
  let p1ReserveCount = 0;
  let p2ReserveCount = 0;
  let p1FrontStrength = 0;
  let p2FrontStrength = 0;
  let p1FrontHp = 0;
  let p2FrontHp = 0;
  let p1Neutrals = 0;
  let p2Neutrals = 0;

  for (const col of state.board) {
    if (col.p1Front) {
      p1FrontCount++;
      const c = state.cards[col.p1Front];
      if (c) {
        p1FrontStrength += strength(c);
        p1FrontHp += Math.max(0, health(c));
      }
    }
    if (col.p2Front) {
      p2FrontCount++;
      const c = state.cards[col.p2Front];
      if (c) {
        p2FrontStrength += strength(c);
        p2FrontHp += Math.max(0, health(c));
      }
    }
    if (col.p1Reserve) p1ReserveCount++;
    if (col.p2Reserve) p2ReserveCount++;
    if (col.neutralOwner === 'p1') p1Neutrals++;
    else if (col.neutralOwner === 'p2') p2Neutrals++;
  }

  return {
    turn: state.turnNumber,
    activePlayer: state.activePlayer,
    p1FrontCount,
    p2FrontCount,
    p1ReserveCount,
    p2ReserveCount,
    p1FrontStrength,
    p2FrontStrength,
    p1FrontHp,
    p2FrontHp,
    p1Neutrals,
    p2Neutrals,
  };
}

function collectOneGame(
  series: string[],
  p1Cards: string[],
  p2Cards: string[],
  seed: string,
  botName: string,
  useMulligan: boolean,
): TurnSnapshot[] | null {
  const snapshots: TurnSnapshot[] = [];
  const seenTurns = new Set<number>();

  const r = runOneGameRaw(series, p1Cards, p2Cards, seed, {
    bots: { p1: makeBot(botName), p2: makeBot(botName) },
    useMulligan,
    onAfterCommand: (state) => {
      const key = state.turnNumber;
      if (seenTurns.has(key)) return;
      seenTurns.add(key);
      snapshots.push(snapshotState(state));
    },
  });

  if (!r) return null;
  return snapshots;
}

// ─── main ───

function pad(s: string, w: number): string {
  return s.length >= w ? s : s + ' '.repeat(w - s.length);
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function main(): void {
  const { scopeStr, series, n, botName, deckIds, useMulligan } = parseArgs(
    process.argv.slice(2),
  );
  const decks = decksForScope(scopeStr).filter((d) => deckIds.includes(d.id));

  console.log('═══════════════════════════════════════════════════');
  console.log(`  Board state timeline`);
  console.log(`  Scope:  ${scopeStr} [${series.join(', ')}]`);
  console.log(`  Bot:    ${botName}${useMulligan ? ' (+ mulligan)' : ''}`);
  console.log(`  Decks:  ${deckIds.join(', ')}`);
  console.log(`  Games:  ${n} per pair`);
  console.log('═══════════════════════════════════════════════════\n');

  const pairs: Array<[string, string]> = [];
  for (const a of deckIds) for (const b of deckIds) pairs.push([a, b]);

  const allGames: TurnSnapshot[][] = [];
  const total = pairs.length * n;
  let done = 0;
  const t0 = Date.now();

  for (const [d1, d2] of pairs) {
    const cards1 = decks.find((d) => d.id === d1)!.cards;
    const cards2 = decks.find((d) => d.id === d2)!.cards;
    for (let i = 0; i < n; i++) {
      const seed = `bst-${d1}-${d2}-${i}`;
      const s = collectOneGame(series, [...cards1], [...cards2], seed, botName, useMulligan);
      if (s) allGames.push(s);
      done++;
      if (done % 50 === 0) {
        process.stdout.write(`\r  running ${done}/${total} …          `);
      }
    }
  }
  process.stdout.write('\r');

  // Группируем по бакетам ходов
  const buckets: Array<[number, number]> = [[1, 3], [4, 6], [7, 9], [10, 12], [13, 15], [16, 18], [19, 21], [22, 24], [25, 27], [28, 30]];

  interface BucketAcc {
    p1Front: number[];
    p2Front: number[];
    p1Reserve: number[];
    p2Reserve: number[];
    p1Strength: number[];
    p2Strength: number[];
    p1Neutrals: number[];
    p2Neutrals: number[];
  }
  const bucketAcc = new Map<string, BucketAcc>();
  for (const [lo, hi] of buckets) {
    bucketAcc.set(`${lo}-${hi}`, {
      p1Front: [], p2Front: [],
      p1Reserve: [], p2Reserve: [],
      p1Strength: [], p2Strength: [],
      p1Neutrals: [], p2Neutrals: [],
    });
  }

  for (const game of allGames) {
    for (const snap of game) {
      for (const [lo, hi] of buckets) {
        if (snap.turn >= lo && snap.turn <= hi) {
          const acc = bucketAcc.get(`${lo}-${hi}`)!;
          acc.p1Front.push(snap.p1FrontCount);
          acc.p2Front.push(snap.p2FrontCount);
          acc.p1Reserve.push(snap.p1ReserveCount);
          acc.p2Reserve.push(snap.p2ReserveCount);
          acc.p1Strength.push(snap.p1FrontStrength);
          acc.p2Strength.push(snap.p2FrontStrength);
          acc.p1Neutrals.push(snap.p1Neutrals);
          acc.p2Neutrals.push(snap.p2Neutrals);
          break;
        }
      }
    }
  }

  console.log('─── Средний размер фронта по ходам ────────────');
  console.log(
    pad('turns', 10) +
      pad('p1_front', 10) +
      pad('p2_front', 10) +
      pad('p1_res', 8) +
      pad('p2_res', 8) +
      pad('p1_str', 8) +
      pad('p2_str', 8) +
      pad('samples', 10),
  );
  for (const [lo, hi] of buckets) {
    const acc = bucketAcc.get(`${lo}-${hi}`)!;
    if (acc.p1Front.length === 0) continue;
    console.log(
      pad(`${lo}–${hi}`, 10) +
        pad(mean(acc.p1Front).toFixed(2), 10) +
        pad(mean(acc.p2Front).toFixed(2), 10) +
        pad(mean(acc.p1Reserve).toFixed(2), 8) +
        pad(mean(acc.p2Reserve).toFixed(2), 8) +
        pad(mean(acc.p1Strength).toFixed(1), 8) +
        pad(mean(acc.p2Strength).toFixed(1), 8) +
        pad(String(acc.p1Front.length), 10),
    );
  }
  console.log('');

  // ─── Интерпретация ───
  console.log('─── Интерпретация ─────────────────────────────');
  let frontOccupiedRatio = 0;
  let totalSamples = 0;
  for (const acc of bucketAcc.values()) {
    for (const v of acc.p1Front) {
      if (v >= 4) frontOccupiedRatio++;
      totalSamples++;
    }
    for (const v of acc.p2Front) {
      if (v >= 4) frontOccupiedRatio++;
      totalSamples++;
    }
  }
  const occupied = totalSamples > 0 ? frontOccupiedRatio / totalSamples : 0;

  if (occupied > 0.6) {
    console.log(`  ⚠ Фронт занят 4-5 картами в ${(occupied * 100).toFixed(0)}% случаев.`);
    console.log('    Фронт «стены» — игра упирается в невозможность пробить.');
    console.log('    Гипотеза H3 (attrition) подтверждается.');
  } else if (occupied > 0.3) {
    console.log(`  Фронт занят 4-5 картами в ${(occupied * 100).toFixed(0)}% случаев.`);
    console.log('    Смешанная картина — есть пики и спады.');
  } else {
    console.log(`  Фронт занят 4-5 картами только в ${(occupied * 100).toFixed(0)}% случаев.`);
    console.log('    Фронт часто недозаполнен — карт не хватает.');
  }

  // ─── Нейтралы ───
  console.log('');
  console.log('─── Контроль нейтралов ────────────────────────');
  console.log(pad('turns', 10) + pad('p1', 10) + pad('p2', 10) + pad('none', 10));
  for (const [lo, hi] of buckets) {
    const acc = bucketAcc.get(`${lo}-${hi}`)!;
    if (acc.p1Neutrals.length === 0) continue;
    const p1 = mean(acc.p1Neutrals);
    const p2 = mean(acc.p2Neutrals);
    console.log(
      pad(`${lo}–${hi}`, 10) +
        pad(p1.toFixed(2), 10) +
        pad(p2.toFixed(2), 10) +
        pad((5 - p1 - p2).toFixed(2), 10),
    );
  }

  console.log('');
  console.log(`─── Time: ${((Date.now() - t0) / 1000).toFixed(1)}s ───────────────────`);
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
}