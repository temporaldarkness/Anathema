#!/usr/bin/env tsx
/**
 * Поиск долгих партий (> порога ходов) + анализ «застоя».
 *
 * Usage:
 *   find-long-games <scope> <N> [botName] [threshold] [--mulligan]
 *
 * Пример:
 *   find-long-games main 100
 *   find-long-games main 100 heuristic-v5-balanced-master 40
 *
 * Для каждой длинной партии сохраняет seed (для trace) + метрики
 * финального состояния. Отдельно — «stuck state»: сколько ходов
 * прошло с последнего изменения glory. Если > 10 — игра застряла.
 */

import type { GameState, CardInstanceId, PlayerId } from '@aspects/engine';
import {
  health,
  strength,
  strengthInBattle,
  opponentOf,
  frontCount,
} from '@aspects/engine';
import { decksForScope, resolveScope, listScopes } from '@aspects/cards';
import { makeBot, listAllBotIds } from '@aspects/bot';
import { runOneGame } from '../src/runner';

const DEFAULT_BOT = 'heuristic-v5-balanced-master';
const DEFAULT_THRESHOLD = 45;

interface Args {
  scopeStr: string;
  series: string[];
  n: number;
  botName: string;
  deckIds: string[];
  useMulligan: boolean;
  threshold: number;
}

function parseArgs(argv: string[]): Args {
  const cleaned: string[] = [];
  let useMulligan = false;
  for (const a of argv) {
    if (a === '--mulligan') useMulligan = true;
    else cleaned.push(a);
  }

  // Последние аргументы могут быть threshold (число) или deck list (строка с запятой).
  const [scopeStr, nStr, ...rest] = cleaned;
  if (!scopeStr || !nStr) {
    console.error(
      'Usage: find-long-games <scope> <N> [botName] [threshold] [--mulligan]',
    );
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
  let threshold = DEFAULT_THRESHOLD;
  let decksArg: string | undefined;

  for (const a of rest) {
    if (/^\d+$/.test(a)) {
      threshold = Number.parseInt(a, 10);
    } else if (a.includes(',')) {
      decksArg = a;
    } else {
      if (!botIds.includes(a)) {
        console.error(`Unknown bot "${a}". Known: ${botIds.join(', ')}`);
        process.exit(1);
      }
      botName = a;
    }
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

  return { scopeStr, series, n, botName, deckIds, useMulligan, threshold };
}

// ─── Анализ одной партии ───

interface LongGameInfo {
  seed: string;
  p1DeckId: string;
  p2DeckId: string;
  turns: number;
  steps: number;
  winner: PlayerId | null;
  winnerReason: string | null;

  // Glory
  p1Glory: number;
  p2Glory: number;

  // Последний ход, когда glory падала — «застой»
  lastGloryChangeTurn: number;
  stuckTurns: number; // turns − lastGloryChangeTurn

  // Состояние доски в конце
  p1FrontCount: number;
  p2FrontCount: number;
  p1Unexhausted: number;
  p2Unexhausted: number;
  p1FrontStrength: number;
  p2FrontStrength: number;
  p1FrontHp: number;
  p2FrontHp: number;

  // Руки
  p1Hand: number;
  p2Hand: number;

  // Атаки за партию
  totalAttacks: number;
  totalCardDeaths: number;
  totalDamageToGlory: number;

  // Детали stuck state (для диагноза)
  stuckState: {
    p1Glory: number;
    p2Glory: number;
    p1Board: string;
    p2Board: string;
  } | null;
}

function snapshotBoard(state: GameState, pid: PlayerId): string {
  const cells: string[] = [];
  for (const col of state.board) {
    const id = pid === 'p1' ? col.p1Front : col.p2Front;
    if (!id) {
      cells.push('·');
      continue;
    }
    const c = state.cards[id];
    if (!c) {
      cells.push('?');
      continue;
    }
    const s = strengthInBattle(state, id);
    const h = Math.max(0, health(c));
    const ex = c.exhausted ? '~' : '';
    cells.push(`${s}/${h}${ex}`);
  }
  return cells.join(' ');
}

function analyzeLongGame(
  series: string[],
  d1: string,
  d2: string,
  seed: string,
  botName: string,
  useMulligan: boolean,
  threshold: number,
): LongGameInfo | null {
  let lastGloryChangeTurn = 0;
  let totalAttacks = 0;
  let totalCardDeaths = 0;
  let totalDamageToGlory = 0;
  let stuckState: LongGameInfo['stuckState'] = null;
  let stuckStateTurn = 0;

  const r = runOneGame(series, d1, d2, seed, {
    bots: { p1: makeBot(botName), p2: makeBot(botName) },
    useMulligan,
    onAfterCommand: (state, cmd, events) => {
      const turn = state.turnNumber;
      if (cmd.type === 'ATTACK') totalAttacks++;
      for (const e of events) {
        if (e.type === 'CARD_DIED') totalCardDeaths++;
        if (e.type === 'GLORY_CHANGED' && e.delta < 0) {
          lastGloryChangeTurn = turn;
          totalDamageToGlory += Math.abs(e.delta);
        }
      }

      // Каждые 5 ходов после порога-10 — обновляем stuckState
      if (turn > threshold - 10 && turn % 5 === 0 && turn > stuckStateTurn) {
        stuckStateTurn = turn;
        stuckState = {
          p1Glory: state.players.p1.glory,
          p2Glory: state.players.p2.glory,
          p1Board: snapshotBoard(state, 'p1'),
          p2Board: snapshotBoard(state, 'p2'),
        };
      }
    },
  });

  if (!r) return null;
  if (r.turns < threshold) return null;

  const fs = r.finalState;

  let p1FrontCount = 0;
  let p2FrontCount = 0;
  let p1Unexhausted = 0;
  let p2Unexhausted = 0;
  let p1FrontStrength = 0;
  let p2FrontStrength = 0;
  let p1FrontHp = 0;
  let p2FrontHp = 0;

  for (const col of fs.board) {
    if (col.p1Front) {
      p1FrontCount++;
      const c = fs.cards[col.p1Front];
      if (c && !c.exhausted) p1Unexhausted++;
      p1FrontStrength += strengthInBattle(fs, col.p1Front);
      p1FrontHp += c ? Math.max(0, health(c)) : 0;
    }
    if (col.p2Front) {
      p2FrontCount++;
      const c = fs.cards[col.p2Front];
      if (c && !c.exhausted) p2Unexhausted++;
      p2FrontStrength += strengthInBattle(fs, col.p2Front);
      p2FrontHp += c ? Math.max(0, health(c)) : 0;
    }
  }

  return {
    seed,
    p1DeckId: d1,
    p2DeckId: d2,
    turns: r.turns,
    steps: r.steps,
    winner: r.winner,
    winnerReason: r.winnerReason,
    p1Glory: fs.players.p1.glory,
    p2Glory: fs.players.p2.glory,
    lastGloryChangeTurn,
    stuckTurns: r.turns - lastGloryChangeTurn,
    p1FrontCount,
    p2FrontCount,
    p1Unexhausted,
    p2Unexhausted,
    p1FrontStrength,
    p2FrontStrength,
    p1FrontHp,
    p2FrontHp,
    p1Hand: fs.players.p1.hand.length,
    p2Hand: fs.players.p2.hand.length,
    totalAttacks,
    totalCardDeaths,
    totalDamageToGlory,
    stuckState,
  };
}

// ─── main ───

function pad(s: string | number, w: number): string {
  const str = String(s);
  return str.length >= w ? str : str + ' '.repeat(w - str.length);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Find long games (>${args.threshold} turns)`);
  console.log(`  Scope:  ${args.scopeStr} [${args.series.join(', ')}]`);
  console.log(`  Bot:    ${args.botName}`);
  console.log(`  Decks:  ${args.deckIds.join(', ')}`);
  console.log(`  Games:  ${args.n} per pair`);
  console.log('═══════════════════════════════════════════════════\n');

  const pairs: Array<[string, string]> = [];
  for (const a of args.deckIds) for (const b of args.deckIds) pairs.push([a, b]);

  const total = pairs.length * args.n;
  const longGames: LongGameInfo[] = [];
  let done = 0;
  let totalGames = 0;
  const t0 = Date.now();

  for (const [d1, d2] of pairs) {
    for (let i = 0; i < args.n; i++) {
      const seed = `flg-${d1}-${d2}-${i}`;
      totalGames++;
      const info = analyzeLongGame(
        args.series,
        d1,
        d2,
        seed,
        args.botName,
        args.useMulligan,
        args.threshold,
      );
      if (info) longGames.push(info);
      done++;
      if (done % 50 === 0) {
        process.stdout.write(`\r  running ${done}/${total} … (found ${longGames.length} long)   `);
      }
    }
  }
  process.stdout.write('\r');

  // Сортировка по убыванию длины
  longGames.sort((a, b) => b.turns - a.turns);

  console.log('─── Сводка ────────────────────────────────────');
  console.log(`  Всего партий:        ${totalGames}`);
  console.log(`  Длинных (>${args.threshold}):      ${longGames.length}  (${((longGames.length / totalGames) * 100).toFixed(1)}%)`);
  console.log('');

  if (longGames.length === 0) {
    console.log('  Нет длинных партий. Порог слишком высокий или закономерность ушла.');
    return;
  }

  // Агрегаты по длинным
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
  };

  const turns = longGames.map((g) => g.turns);
  const stuck = longGames.map((g) => g.stuckTurns);
  const winnerGlory = longGames
    .filter((g) => g.winner !== null)
    .map((g) => (g.winner === 'p1' ? g.p1Glory : g.p2Glory));
  const loserGlory = longGames
    .filter((g) => g.winner !== null)
    .map((g) => (g.winner === 'p1' ? g.p2Glory : g.p1Glory));

  console.log('─── Распределение длинных ─────────────────────');
  console.log(`  Turns:          mean=${avg(turns).toFixed(1)}  median=${median(turns)}  max=${Math.max(...turns)}`);
  console.log(`  Stuck turns:    mean=${avg(stuck).toFixed(1)}  median=${median(stuck)}`);
  console.log(`  (stuck = ходов с последнего изменения glory)`);
  console.log('');
  console.log(`  Winner glory:   mean=${avg(winnerGlory).toFixed(1)}`);
  console.log(`  Loser glory:    mean=${avg(loserGlory).toFixed(1)}`);
  console.log('');

  // Причины победы
  const reasons: Record<string, number> = {};
  for (const g of longGames) {
    const r = g.winnerReason ?? 'unknown';
    reasons[r] = (reasons[r] ?? 0) + 1;
  }
  console.log('  Причины победы в длинных:');
  for (const [k, v] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${pad(k, 16)} ${v} (${((v / longGames.length) * 100).toFixed(1)}%)`);
  }
  console.log('');

  // Сколько длинных с большим stuck
  const stuckBig = longGames.filter((g) => g.stuckTurns >= 10).length;
  const stuckHuge = longGames.filter((g) => g.stuckTurns >= 20).length;
  console.log(`  Партий со stuck ≥10: ${stuckBig} (${((stuckBig / longGames.length) * 100).toFixed(1)}%)`);
  console.log(`  Партий со stuck ≥20: ${stuckHuge} (${((stuckHuge / longGames.length) * 100).toFixed(1)}%)`);
  console.log('');

  // ─── Топ-10 самых длинных ───
  console.log('─── Топ-10 самых длинных (для trace) ─────────');
  console.log(
    pad('turns', 6) +
      pad('stuck', 6) +
      pad('glory', 12) +
      pad('winner', 8) +
      pad('decks', 32) +
      'seed',
  );
  for (const g of longGames.slice(0, 10)) {
    const glory = `${g.p1Glory}/${g.p2Glory}`;
    const winner = g.winner ?? 'draw';
    const decks = `${g.p1DeckId} vs ${g.p2DeckId}`;
    console.log(
      pad(g.turns, 6) +
        pad(g.stuckTurns, 6) +
        pad(glory, 12) +
        pad(winner, 8) +
        pad(decks, 32) +
        g.seed,
    );
  }
  console.log('');

  // ─── Топ-5 самых «застрявших» ───
  const worstStuck = [...longGames].sort((a, b) => b.stuckTurns - a.stuckTurns).slice(0, 5);
  console.log('─── Топ-5 застрявших (stuck turns) ────────────');
  console.log(
    pad('turns', 6) +
      pad('stuck', 6) +
      pad('glory', 12) +
      pad('winner', 8) +
      'seed',
  );
  for (const g of worstStuck) {
    const glory = `${g.p1Glory}/${g.p2Glory}`;
    const winner = g.winner ?? 'draw';
    console.log(
      pad(g.turns, 6) +
        pad(g.stuckTurns, 6) +
        pad(glory, 12) +
        pad(winner, 8) +
        g.seed,
    );
  }
  console.log('');

  // ─── Детали первой самой длинной ───
  const worst = longGames[0];
  console.log('─── Детали самой длинной партии ───────────────');
  console.log(`  Seed:     ${worst.seed}`);
  console.log(`  Decks:    ${worst.p1DeckId} (P1) vs ${worst.p2DeckId} (P2)`);
  console.log(`  Turns:    ${worst.turns}`);
  console.log(`  Winner:   ${worst.winner} (${worst.winnerReason})`);
  console.log(`  Glory:    P1=${worst.p1Glory}  P2=${worst.p2Glory}`);
  console.log(`  Stuck:    ${worst.stuckTurns} ходов без изменения glory`);
  console.log('');
  console.log(`  Атаки:    ${worst.totalAttacks}`);
  console.log(`  Смертей:  ${worst.totalCardDeaths}`);
  console.log(`  Урон по гильдии: ${worst.totalDamageToGlory}`);
  console.log('');
  console.log(`  Финальная доска:`);
  console.log(`    P1 front: ${worst.p1FrontCount} карт, ${worst.p1Unexhausted} неистощённых, сила=${worst.p1FrontStrength}, HP=${worst.p1FrontHp}`);
  console.log(`    P2 front: ${worst.p2FrontCount} карт, ${worst.p2Unexhausted} неистощённых, сила=${worst.p2FrontStrength}, HP=${worst.p2FrontHp}`);
  console.log(`    P1 hand: ${worst.p1Hand}   P2 hand: ${worst.p2Hand}`);
  console.log('');

  if (worst.stuckState) {
    console.log(`  Stuck state (~хода ${Math.max(0, worst.turns - worst.stuckTurns)}):`);
    console.log(`    Glory: P1=${worst.stuckState.p1Glory}  P2=${worst.stuckState.p2Glory}`);
    console.log(`    P1 front: ${worst.stuckState.p1Board}`);
    console.log(`    P2 front: ${worst.stuckState.p2Board}`);
    console.log('');
  }

  console.log('─── Дальше ────────────────────────────────────');
  console.log('  Trace длинной партии:');
  console.log(`    pnpm run --filter @aspects/simtools trace ${args.scopeStr} <p1Deck> <p2Deck> <seed> ${args.botName}`);
  console.log('');
  console.log(`─── Time: ${((Date.now() - t0) / 1000).toFixed(1)}s ───────────────────`);
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}