#!/usr/bin/env tsx
/**
 * Детектор упущенных летальных ударов.
 *
 * На начало каждой COMBAT-фазы проверяем:
 *   - фронт оппонента пуст
 *   - суммарная сила неистощённых юнитов активного игрока во Фронте
 *     >= glory оппонента
 * Если условия выполнены, но за всю фазу glory оппонента не упала до 0 —
 * это missed lethal (AI-баг или осторожность бота).
 *
 * Usage:
 *   missed-lethal <scope> <N> [botName] [deck1,deck2,...] [--mulligan]
 */

import type { GameState, PlayerId } from '@aspects/engine';
import { frontCount, strengthInBattle } from '@aspects/engine';
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
    console.error('Usage: missed-lethal <scope> <N> [botName] [deck1,deck2,...] [--mulligan]');
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

// ─── Логика детектора ───

interface LethalCheck {
  oppFrontEmpty: boolean;
  availablePower: number;
  oppGlory: number;
  isLethal: boolean;
}

function checkLethal(state: GameState, activePlayer: PlayerId): LethalCheck {
  const opp: PlayerId = activePlayer === 'p1' ? 'p2' : 'p1';
  const oppFrontEmpty = frontCount(state, opp) === 0;

  let availablePower = 0;
  for (let i = 0; i < 5; i++) {
    const col = state.board[i];
    const frontId = activePlayer === 'p1' ? col.p1Front : col.p2Front;
    if (!frontId) continue;
    const card = state.cards[frontId];
    if (!card || card.exhausted) continue;
    availablePower += strengthInBattle(state, frontId);
  }

  return {
    oppFrontEmpty,
    availablePower,
    oppGlory: state.players[opp].glory,
    isLethal: oppFrontEmpty && availablePower >= state.players[opp].glory && state.players[opp].glory > 0,
  };
}

interface GameAnalysis {
  // Общее
  lethalTurns: number;       // сколько раз летал был доступен на начало COMBAT
  missedLethal: number;      // из них — не убил за эту фазу
  // Детали по каждой упущенной ситуации
  missedDetails: Array<{
    turn: number;
    playerId: PlayerId;
    availablePower: number;
    oppGlory: number;
  }>;
}

function analyzeOneGame(
  series: string[],
  p1Cards: string[],
  p2Cards: string[],
  seed: string,
  botName: string,
  useMulligan: boolean,
): GameAnalysis | null {
  const analysis: GameAnalysis = {
    lethalTurns: 0,
    missedLethal: 0,
    missedDetails: [],
  };

  // Отслеживаем текущую COMBAT-фазу
  let inCombat = false;
  let combatPlayer: PlayerId | null = null;
  let lethalAtCombatStart: LethalCheck | null = null;

  const r = runOneGameRaw(series, [...p1Cards], [...p2Cards], seed, {
    bots: { p1: makeBot(botName), p2: makeBot(botName) },
    useMulligan,
    onAfterCommand: (state) => {
      const wasInCombat = inCombat;
      const nowInCombat = state.phase === 'COMBAT';

      // Вход в COMBAT
      if (!wasInCombat && nowInCombat) {
        inCombat = true;
        combatPlayer = state.activePlayer;
        lethalAtCombatStart = checkLethal(state, combatPlayer);
        if (lethalAtCombatStart.isLethal) {
          analysis.lethalTurns++;
        }
      }

      // Выход из COMBAT
      if (wasInCombat && !nowInCombat) {
        // Проверяем missed: если летал был, но опп не умер
        if (
          lethalAtCombatStart &&
          lethalAtCombatStart.isLethal &&
          combatPlayer
        ) {
          const opp: PlayerId = combatPlayer === 'p1' ? 'p2' : 'p1';
          if (state.players[opp].glory > 0) {
            analysis.missedLethal++;
            analysis.missedDetails.push({
              turn: state.turnNumber,
              playerId: combatPlayer,
              availablePower: lethalAtCombatStart.availablePower,
              oppGlory: lethalAtCombatStart.oppGlory,
            });
          }
        }
        inCombat = false;
        combatPlayer = null;
        lethalAtCombatStart = null;
      }

      // Если игра закончилась — проверяем missed тоже
      if (state.winner && wasInCombat && lethalAtCombatStart?.isLethal && combatPlayer) {
        const opp: PlayerId = combatPlayer === 'p1' ? 'p2' : 'p1';
        if (state.winner !== combatPlayer) {
          // Наш «летальный» игрок не победил — значит это был false positive или missed
          // Если летал был настоящий, а он не убил — missed
          // Упрощаем: если летал был доступен, но glory опп > 0 — missed
          if (state.players[opp].glory > 0) {
            analysis.missedLethal++;
            analysis.missedDetails.push({
              turn: state.turnNumber,
              playerId: combatPlayer,
              availablePower: lethalAtCombatStart.availablePower,
              oppGlory: lethalAtCombatStart.oppGlory,
            });
          }
        }
        // Сбрасываем флаг чтобы не посчитать дважды
        inCombat = false;
        combatPlayer = null;
        lethalAtCombatStart = null;
      }
    },
  });

  if (!r) return null;
  return analysis;
}

// ─── main ───

function pad(s: string, w: number): string {
  return s.length >= w ? s : s + ' '.repeat(w - s.length);
}

function main(): void {
  const { scopeStr, series, n, botName, deckIds, useMulligan } = parseArgs(
    process.argv.slice(2),
  );
  const decks = decksForScope(scopeStr).filter((d) => deckIds.includes(d.id));

  console.log('═══════════════════════════════════════════════════');
  console.log(`  Missed lethal detector`);
  console.log(`  Scope:  ${scopeStr} [${series.join(', ')}]`);
  console.log(`  Bot:    ${botName}${useMulligan ? ' (+ mulligan)' : ''}`);
  console.log(`  Decks:  ${deckIds.join(', ')}`);
  console.log(`  Games:  ${n} per pair`);
  console.log('═══════════════════════════════════════════════════\n');

  const pairs: Array<[string, string]> = [];
  for (const a of deckIds) for (const b of deckIds) pairs.push([a, b]);

  const total = pairs.length * n;
  let done = 0;
  const t0 = Date.now();

  let totalLethalTurns = 0;
  let totalMissed = 0;
  let gamesWithMissed = 0;
  const missedDetails: Array<{ game: string; detail: GameAnalysis['missedDetails'][0] }> = [];

  for (const [d1, d2] of pairs) {
    const cards1 = decks.find((d) => d.id === d1)!.cards;
    const cards2 = decks.find((d) => d.id === d2)!.cards;

    for (let i = 0; i < n; i++) {
      const seed = `ml-${d1}-${d2}-${i}`;
      const a = analyzeOneGame(series, cards1, cards2, seed, botName, useMulligan);
      if (!a) continue;

      totalLethalTurns += a.lethalTurns;
      totalMissed += a.missedLethal;
      if (a.missedLethal > 0) {
        gamesWithMissed++;
        for (const d of a.missedDetails) {
          missedDetails.push({ game: `${d1} vs ${d2} #${i}`, detail: d });
        }
      }

      done++;
      if (done % 100 === 0) {
        process.stdout.write(`\r  running ${done}/${total} …          `);
      }
    }
  }
  process.stdout.write('\r');

  // ─── Сводка ───
  console.log('─── Общая статистика ──────────────────────────');
  console.log(`  Games:                    ${done}`);
  console.log(`  Games with lethal available: ${gamesWithMissed > 0 ? '≥' : ''}${totalLethalTurns > 0 ? 'есть' : 'нет'}`);
  console.log(`  Lethal turns (всего):     ${totalLethalTurns}`);
  console.log(`  Missed lethal (всего):    ${totalMissed}`);
  const missRate = totalLethalTurns > 0 ? (totalMissed / totalLethalTurns) * 100 : 0;
  console.log(`  Miss rate:                ${missRate.toFixed(1)}% (от lethal turns)`);
  console.log('');

  // ─── Оценка ───
  console.log('─── Интерпретация ─────────────────────────────');
  if (totalLethalTurns === 0) {
    console.log('  Летал ни разу не был доступен на начало COMBAT.');
    console.log('  Это значит: партии не доходят до состояния «пустой фронт + хватает силы».');
    console.log('  Проблема pace не в том, что бот не убивает — а в том, что');
    console.log('  до состояния летала игра не доходит. Фронт постоянно занят.');
  } else if (missRate === 0) {
    console.log('  Бот идеален: 100% летальных ситуаций закрыты.');
  } else if (missRate < 5) {
    console.log(`  Miss rate < 5% — бот почти идеален, редкие ошибки.`);
  } else if (missRate < 15) {
    console.log(`  Miss rate 5–15% — заметные упущения, стоит посмотреть примеры.`);
  } else {
    console.log(`  Miss rate > 15% — серьёзная проблема AI. Бот не дожимает.`);
  }
  console.log('');

  // ─── Детали по упущениям ───
  if (missedDetails.length > 0) {
    console.log('─── Первые 20 упущенных ситуаций ─────────────');
    for (const { game, detail } of missedDetails.slice(0, 20)) {
      console.log(
        `  ${pad(game, 30)} turn=${pad(String(detail.turn), 3)} player=${detail.playerId} ` +
          `power=${pad(String(detail.availablePower), 3)} vs glory=${detail.oppGlory}`,
      );
    }
    if (missedDetails.length > 20) {
      console.log(`  … ещё ${missedDetails.length - 20}`);
    }
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