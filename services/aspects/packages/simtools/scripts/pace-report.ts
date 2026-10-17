#!/usr/bin/env tsx
/**
 * Pace report v2: длина партии, стоимость, влияние, рука,
 * idle-ходы, однa-ходовые смерти.
 *
 * Usage:
 *   pace-report <scope> <N> [botName] [deck1,deck2,...] [--mulligan]
 */

import type { GameState, Command, GameEvent } from '@aspects/engine';
import type { CardInstanceId } from '@aspects/engine';
import { decksForScope, resolveScope, listScopes } from '@aspects/cards';
import { makeBot, listAllBotIds } from '@aspects/bot';
import { runOneGame } from '../src/runner';

const DEFAULT_BOT = 'heuristic-v5-balanced-master';

interface Args {
  scopeStr: string;
  series: string[];
  n: number;
  botName: string;
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
  const [scopeStr, nStr, arg3, arg4] = cleaned;
  if (!scopeStr || !nStr) {
    console.error(
      'Usage: pace-report <scope> <N> [botName] [deck1,deck2,...] [--mulligan]',
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

// ─── Аккумулятор одной партии ───

interface TurnSnapshot {
  turn: number;
  activePlayer: 'p1' | 'p2';
  p1Hand: number;
  p2Hand: number;
  p1Influence: number;
  p2Influence: number;
}

interface PerGameStats {
  turns: number;
  steps: number;
  winnerReason: string | null;

  playedCardsCost: number[];

  firstTurnOfPlay: number | null;
  firstTurnOfCardDeath: number | null;
  firstTurnOfNeutralCapture: number | null;
  firstTurnOfGloryBelow20: number | null;
  firstTurnOfGloryBelow10: number | null;

  neutralEndP1: number;
  neutralEndP2: number;
  neutralEndNone: number;

  // v2:
  turnSnapshots: TurnSnapshot[];
  unusedInfluenceEndOfPlay: number[];
  costByTurn: Map<number, number[]>;
  turnsWithAction: Set<number>;
  oneTurnDeaths: number;
  totalPlays: number;
}

function collectOneGame(
  series: string[],
  p1DeckId: string,
  p2DeckId: string,
  seed: string,
  botName: string,
  useMulligan: boolean,
): PerGameStats | null {
  // Локальные аккумуляторы
  const playedCardsCost: number[] = [];
  let firstTurnOfPlay: number | null = null;
  let firstTurnOfCardDeath: number | null = null;
  let firstTurnOfNeutralCapture: number | null = null;
  let firstTurnOfGloryBelow20: number | null = null;
  let firstTurnOfGloryBelow10: number | null = null;

  const turnSnapshots: TurnSnapshot[] = [];
  const seenTurns = new Set<number>();
  const unusedInfluenceEndOfPlay: number[] = [];
  const costByTurn = new Map<number, number[]>();
  const turnsWithAction = new Set<number>();
  const playedCardTurns = new Map<CardInstanceId, number>();
  let oneTurnDeaths = 0;
  let totalPlays = 0;

  const r = runOneGame(series, p1DeckId, p2DeckId, seed, {
    bots: { p1: makeBot(botName), p2: makeBot(botName) },
    useMulligan,
    onAfterCommand: (state, cmd, events) => {
      const turn = state.turnNumber;

      // 1. Snapshot руки и влияния — один раз на ход
      if (!seenTurns.has(turn)) {
        seenTurns.add(turn);
        turnSnapshots.push({
          turn,
          activePlayer: state.activePlayer,
          p1Hand: state.players.p1.hand.length,
          p2Hand: state.players.p2.hand.length,
          p1Influence: state.players.p1.influence,
          p2Influence: state.players.p2.influence,
        });
      }

      // 2. Разыгранные карты
      if (cmd.type === 'PLAY_CARD') {
        const card = state.cards[cmd.cardId];
        if (card) {
          const def = state.definitions[card.definitionId];
          if (def) {
            playedCardsCost.push(def.cost);
            totalPlays++;
            playedCardTurns.set(cmd.cardId, turn);
            const arr = costByTurn.get(turn) ?? [];
            arr.push(def.cost);
            costByTurn.set(turn, arr);
          }
        }
      }

      // 3. Значимое действие в этот ход
      if (
        cmd.type === 'PLAY_CARD' ||
        cmd.type === 'ATTACK' ||
        cmd.type === 'USE_ABILITY'
      ) {
        turnsWithAction.add(turn);
      }

      // 4. События: PHASE_CHANGED, death, capture, glory
      for (const e of events) {
        if (e.type === 'PHASE_CHANGED' && e.phase === 'COMBAT') {
          unusedInfluenceEndOfPlay.push(state.players[e.playerId].influence);
        }
        if (e.type === 'CARD_PLAYED' && firstTurnOfPlay === null) {
          firstTurnOfPlay = turn;
        }
        if (e.type === 'CARD_DIED') {
          if (firstTurnOfCardDeath === null) firstTurnOfCardDeath = turn;
          const playTurn = playedCardTurns.get(e.cardId);
          if (playTurn !== undefined && turn - playTurn <= 1) {
            oneTurnDeaths++;
          }
        }
        if (e.type === 'NEUTRAL_CAPTURED' && firstTurnOfNeutralCapture === null) {
          firstTurnOfNeutralCapture = turn;
        }
        if (e.type === 'GLORY_CHANGED') {
          if (e.total < 20 && firstTurnOfGloryBelow20 === null) {
            firstTurnOfGloryBelow20 = turn;
          }
          if (e.total < 10 && firstTurnOfGloryBelow10 === null) {
            firstTurnOfGloryBelow10 = turn;
          }
        }
      }
    },
  });

  if (!r) return null;

  const fs = r.finalState;
  let neutralEndP1 = 0;
  let neutralEndP2 = 0;
  let neutralEndNone = 0;
  for (const col of fs.board) {
    if (col.neutralOwner === 'p1') neutralEndP1++;
    else if (col.neutralOwner === 'p2') neutralEndP2++;
    else neutralEndNone++;
  }

  return {
    turns: r.turns,
    steps: r.steps,
    winnerReason: r.winnerReason,
    playedCardsCost,
    firstTurnOfPlay,
    firstTurnOfCardDeath,
    firstTurnOfNeutralCapture,
    firstTurnOfGloryBelow20,
    firstTurnOfGloryBelow10,
    neutralEndP1,
    neutralEndP2,
    neutralEndNone,
    turnSnapshots,
    unusedInfluenceEndOfPlay,
    costByTurn,
    turnsWithAction,
    oneTurnDeaths,
    totalPlays,
  };
}

// ─── Хелперы ───

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

function pct(x: number, total: number): string {
  if (total === 0) return '  n/a';
  return `${((x / total) * 100).toFixed(1)}%`;
}

function histogram(values: number[], bucketSize: number, maxBucket: number): string {
  const buckets = new Array(Math.floor(maxBucket / bucketSize) + 1).fill(0);
  for (const v of values) {
    const idx = Math.min(buckets.length - 1, Math.floor(v / bucketSize));
    buckets[idx]++;
  }
  const maxCount = Math.max(...buckets, 1);
  const lines: string[] = [];
  for (let i = 0; i < buckets.length; i++) {
    const lo = i * bucketSize;
    const hi = lo + bucketSize - 1;
    const c = buckets[i];
    const bar = '▓'.repeat(Math.round((c / maxCount) * 30));
    const label = `${String(lo).padStart(3)}–${String(hi).padStart(3)}`;
    lines.push(`  ${label}  ${bar}  ${String(c).padStart(4)}`);
  }
  return lines.join('\n');
}

// ─── main ───

function main(): void {
  const { scopeStr, series, n, botName, deckIds, useMulligan } = parseArgs(
    process.argv.slice(2),
  );

  console.log('═══════════════════════════════════════════════════');
  console.log(`  Pace report`);
  console.log(`  Scope:  ${scopeStr}  [${series.join(', ')}]`);
  console.log(`  Bot:    ${botName}${useMulligan ? ' (+ mulligan)' : ''}`);
  console.log(`  Decks:  ${deckIds.join(', ')}`);
  console.log(`  Games:  ${n} per (p1,p2) pair`);
  console.log('═══════════════════════════════════════════════════\n');

  const pairs: Array<[string, string]> = [];
  for (const a of deckIds) for (const b of deckIds) pairs.push([a, b]);

  const total = pairs.length * n;
  const all: PerGameStats[] = [];
  let done = 0;
  const t0 = Date.now();

  for (const [d1, d2] of pairs) {
    for (let i = 0; i < n; i++) {
      const seed = `pace-${d1}-${d2}-${i}`;
      const s = collectOneGame(series, d1, d2, seed, botName, useMulligan);
      if (s) all.push(s);
      done++;
      if (done % 50 === 0) {
        process.stdout.write(`\r  running ${done}/${total} …          `);
      }
    }
  }
  process.stdout.write('\r');

  // ─── Длина партии ───
  const turns = all.map((g) => g.turns);
  const steps = all.map((g) => g.steps);
  console.log('─── Длина партии ──────────────────────────────');
  console.log(`  Games:    ${all.length}`);
  console.log(`  Min/Max:  ${Math.min(...turns)} / ${Math.max(...turns)}`);
  console.log(`  Mean:     ${mean(turns).toFixed(1)} ходов  (${mean(steps).toFixed(0)} команд)`);
  console.log(`  Median:   ${median(turns)} ходов`);
  console.log('');
  console.log('  Гистограмма ходов (bucket = 5):');
  console.log(histogram(turns, 5, 60));
  console.log('');

  // ─── Стоимость карт ───
  const allCosts = all.flatMap((g) => g.playedCardsCost);
  const costHist = new Array(11).fill(0);
  for (const c of allCosts) {
    const idx = Math.min(10, Math.max(0, c));
    costHist[idx]++;
  }
  const totalPlayed = allCosts.length;
  console.log('─── Стоимость разыгранных карт ────────────────');
  console.log(`  Всего сыграно:      ${totalPlayed}`);
  console.log(`  На партию:          ${(totalPlayed / all.length).toFixed(1)}`);
  console.log(`  Средний cost:       ${mean(allCosts).toFixed(2)}`);
  console.log(`  Медиана cost:       ${median(allCosts)}`);
  console.log('');
  console.log('  Распределение cost (0..10):');
  const maxCostCount = Math.max(...costHist, 1);
  for (let i = 0; i <= 10; i++) {
    const c = costHist[i];
    const bar = '▓'.repeat(Math.round((c / maxCostCount) * 30));
    console.log(`  ${String(i).padStart(2)}💰  ${bar}  ${String(c).padStart(5)}  ${pct(c, totalPlayed)}`);
  }
  console.log('');
  const cheap = allCosts.filter((c) => c <= 2).length;
  const mid = allCosts.filter((c) => c >= 3 && c <= 4).length;
  const expensive = allCosts.filter((c) => c >= 5).length;
  console.log(`  Дешёвых (0-2):      ${pct(cheap, totalPlayed)}`);
  console.log(`  Средних (3-4):      ${pct(mid, totalPlayed)}`);
  console.log(`  Дорогих (5+):       ${pct(expensive, totalPlayed)}`);
  console.log('');

  // ─── НОВОЕ: Средний cost по ходам ───
  console.log('─── Средний cost по ходам ─────────────────────');
  for (const [lo, hi] of [[1, 5], [6, 10], [11, 15], [16, 20], [21, 25], [26, 30]] as const) {
    const allInBucket: number[] = [];
    for (const g of all) {
      for (const [turn, costs] of g.costByTurn.entries()) {
        if (turn >= lo && turn <= hi) allInBucket.push(...costs);
      }
    }
    const avg = allInBucket.length > 0 ? mean(allInBucket).toFixed(2) : '—';
    const n2 = allInBucket.length;
    console.log(`  Ходы ${String(lo).padStart(2)}–${String(hi).padStart(2)}:  avg=${avg}  (n=${n2})`);
  }
  console.log('');

  // ─── НОВОЕ: Размер руки ───
  console.log('─── Средний размер руки (активный игрок) ─────');
  for (const [lo, hi] of [[1, 5], [6, 10], [11, 15], [16, 20], [21, 25], [26, 30]] as const) {
    const sizes: number[] = [];
    for (const g of all) {
      for (const snap of g.turnSnapshots) {
        if (snap.turn >= lo && snap.turn <= hi) {
          sizes.push(snap.activePlayer === 'p1' ? snap.p1Hand : snap.p2Hand);
        }
      }
    }
    const avg = sizes.length > 0 ? mean(sizes).toFixed(2) : '—';
    console.log(`  Ходы ${String(lo).padStart(2)}–${String(hi).padStart(2)}:  avg=${avg}  (n=${sizes.length})`);
  }
  console.log('');

  // ─── НОВОЕ: Неистраченное влияние в конце PLAY ───
  const unusedInf = all.flatMap((g) => g.unusedInfluenceEndOfPlay);
  const infHist = [0, 0, 0, 0, 0, 0]; // 0-1, 2-3, 4-5, 6-7, 8-9, 10
  for (const v of unusedInf) {
    const idx = Math.min(5, Math.floor(v / 2));
    infHist[idx]++;
  }
  console.log('─── Неистраченное влияние (конец PLAY) ────────');
  console.log(`  Замеров:    ${unusedInf.length}`);
  console.log(`  Среднее:    ${mean(unusedInf).toFixed(2)} / 10`);
  console.log(`  Медиана:    ${median(unusedInf)}`);
  console.log('');
  const infLabels = ['0-1', '2-3', '4-5', '6-7', '8-9', '10 '];
  const maxInfCount = Math.max(...infHist, 1);
  for (let i = 0; i < infHist.length; i++) {
    const c = infHist[i];
    const bar = '▓'.repeat(Math.round((c / maxInfCount) * 30));
    console.log(`  ${infLabels[i]}💰  ${bar}  ${String(c).padStart(5)}  ${pct(c, unusedInf.length)}`);
  }
  console.log('');

  // ─── НОВОЕ: Idle-ходы ───
  console.log('─── Idle-ходы (нет PLAY_CARD/ATTACK/USE_ABILITY) ───');
  const idleFractions: number[] = [];
  let totalTurnsAll = 0;
  let totalIdleTurns = 0;
  for (const g of all) {
    const idle = g.turns - g.turnsWithAction.size;
    idleFractions.push(idle / g.turns);
    totalTurnsAll += g.turns;
    totalIdleTurns += idle;
  }
  console.log(`  Всего ходов:    ${totalTurnsAll}`);
  console.log(`  Idle-ходов:     ${totalIdleTurns}  (${pct(totalIdleTurns, totalTurnsAll)})`);
  console.log(`  Среднее на партию: ${(totalIdleTurns / all.length).toFixed(2)} ходов`);
  console.log('');

  // ─── НОВОЕ: Однa-ходовые смерти ───
  const totalPlays = all.reduce((a, g) => a + g.totalPlays, 0);
  const totalOneTurnDeaths = all.reduce((a, g) => a + g.oneTurnDeaths, 0);
  console.log('─── Карты, умершие в течение 1 хода ───────────');
  console.log(`  Разыграно:            ${totalPlays}`);
  console.log(`  Умерли за 1 ход:      ${totalOneTurnDeaths}  (${pct(totalOneTurnDeaths, totalPlays)})`);
  console.log('');

  // ─── Фазы партии ───
  const fPlay = all.map((g) => g.firstTurnOfPlay).filter((x): x is number => x !== null);
  const fDeath = all.map((g) => g.firstTurnOfCardDeath).filter((x): x is number => x !== null);
  const fNeutral = all.map((g) => g.firstTurnOfNeutralCapture).filter((x): x is number => x !== null);
  const fGlory20 = all.map((g) => g.firstTurnOfGloryBelow20).filter((x): x is number => x !== null);
  const fGlory10 = all.map((g) => g.firstTurnOfGloryBelow10).filter((x): x is number => x !== null);

  console.log('─── Ключевые вехи партии ──────────────────────');
  console.log(`  Первый розыгрыш:        сред. ход ${mean(fPlay).toFixed(1)}`);
  console.log(`  Первая смерть карты:    сред. ход ${mean(fDeath).toFixed(1)}`);
  console.log(`  Первый захват нейтрала: сред. ход ${mean(fNeutral).toFixed(1)}`);
  console.log(`  Первое падение до <20:  сред. ход ${mean(fGlory20).toFixed(1)}`);
  console.log(`  Первое падение до <10:  сред. ход ${mean(fGlory10).toFixed(1)}`);
  console.log('');

  // ─── Причины завершения ───
  const reasons: Record<string, number> = {};
  for (const g of all) {
    const r = g.winnerReason ?? 'unknown';
    reasons[r] = (reasons[r] ?? 0) + 1;
  }
  console.log('─── Причины завершения ────────────────────────');
  for (const [k, v] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(16)} ${String(v).padStart(5)}  ${pct(v, all.length)}`);
  }
  console.log('');

  // ─── Нейтралы ───
  const neutralP1 = mean(all.map((g) => g.neutralEndP1));
  const neutralP2 = mean(all.map((g) => g.neutralEndP2));
  const neutralNone = mean(all.map((g) => g.neutralEndNone));
  console.log('─── Нейтралы к концу партии ───────────────────');
  console.log(`  Под P1:      ${neutralP1.toFixed(2)} / 5`);
  console.log(`  Под P2:      ${neutralP2.toFixed(2)} / 5`);
  console.log(`  Ничейных:    ${neutralNone.toFixed(2)} / 5`);
  console.log('');

  console.log(`─── Time: ${((Date.now() - t0) / 1000).toFixed(1)}s ───────────────────`);
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}