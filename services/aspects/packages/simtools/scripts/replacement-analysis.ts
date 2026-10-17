#!/usr/bin/env tsx
/**
 * Анализ замен: как часто доступна, как часто используется,
 * какие замены делает бот, влияют ли замены на winrate.
 *
 * Usage:
 *   replacement-analysis <scope> <N> [botName] [deck1,deck2,...] [--mulligan]
 */

import type { GameState, Command, GameEvent, CardInstanceId, PlayerId } from '@aspects/engine';
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
    console.error('Usage: replacement-analysis <scope> <N> [botName] [deck1,deck2,...] [--mulligan]');
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

// ─── Проверка «можно ли сделать замену» ───

interface ReplacementOpportunity {
  turn: number;
  playerId: PlayerId;
  newCardId: CardInstanceId;
  oldCardIds: CardInstanceId[];
}

function findReplacementOpportunities(
  state: GameState,
  playerId: PlayerId,
): ReplacementOpportunity[] {
  // В фазе PLAY, не заменяли в этот ход
  if (state.phase !== 'PLAY') return [];
  if (state.activePlayer !== playerId) return [];
  if (state.players[playerId].replacementUsedThisTurn) return [];

  const out: ReplacementOpportunity[] = [];

  // Для каждой карты в руке — найти Личность на доске
  for (const handCardId of state.players[playerId].hand) {
    const handCard = state.cards[handCardId];
    if (!handCard) continue;
    const handDef = state.definitions[handCard.definitionId];
    if (!handDef) continue;
    if (handDef.isToken) continue;

    const oldIds: CardInstanceId[] = [];
    for (const col of state.board) {
      const f = playerId === 'p1' ? col.p1Front : col.p2Front;
      const r = playerId === 'p1' ? col.p1Reserve : col.p2Reserve;
      for (const id of [f, r]) {
        if (!id) continue;
        const c = state.cards[id];
        if (!c) continue;
        const d = state.definitions[c.definitionId];
        if (d && d.personalityTag === handDef.personalityTag) {
          oldIds.push(id);
        }
      }
    }
    if (oldIds.length > 0) {
      out.push({
        turn: state.turnNumber,
        playerId,
        newCardId: handCardId,
        oldCardIds: oldIds,
      });
    }
  }

  return out;
}

// ─── Сбор одной партии ───

interface ReplacementEvent {
  turn: number;
  playerId: PlayerId;
  oldCardId: CardInstanceId;
  newCardId: CardInstanceId;
  oldName: string;
  newName: string;
  oldCost: number;
  newCost: number;
  oldHp: number;
  newHp: number;
  oldSilenced: boolean;
  // Был ли доступен более дешёвый вариант в руке
  cheaperAlternativeExists: boolean;
}

interface GameStats {
  winner: PlayerId | null;
  opportunities: number;
  actuallyReplaced: number;
  replacements: ReplacementEvent[];
}

function collectOneGame(
  series: string[],
  p1Cards: string[],
  p2Cards: string[],
  seed: string,
  botName: string,
  useMulligan: boolean,
): GameStats | null {
  const stats: GameStats = {
    winner: null,
    opportunities: 0,
    actuallyReplaced: 0,
    replacements: [],
  };

  // Трекаем turn × player для дедупликации оппортьюнити
  const trackedOpportunities = new Set<string>();
  let lastCmdPlay: { cardId: CardInstanceId; playerId: PlayerId } | null = null;

  const r = runOneGameRaw(series, p1Cards, p2Cards, seed, {
    bots: { p1: makeBot(botName), p2: makeBot(botName) },
    useMulligan,
    onAfterCommand: (state, cmd, events) => {
      // 1. Считаем оппортьюнити в текущем состоянии
      for (const pid of ['p1', 'p2'] as PlayerId[]) {
        const opps = findReplacementOpportunities(state, pid);
        for (const opp of opps) {
          const key = `${pid}-${opp.turn}-${opp.newCardId}`;
          if (trackedOpportunities.has(key)) continue;
          trackedOpportunities.add(key);
          stats.opportunities++;
        }
      }

      // 2. Смотрим на реальные замены.
      // ВАЖНО: в новой архитектуре замена идёт в ДВЕ команды —
      // REPLACE_CARD ставит pendingChoice, RESOLVE_CHOICE применяет.
      // CARD_REPLACED эмитится во ВТОРОЙ команде. Проверяем события
      // любой команды, не только REPLACE_CARD.
      for (const e of events) {
        if (e.type === 'CARD_REPLACED') {
          const oldId = e.oldCardId;
          const newId = e.newCardId;
          const oldCard = state.cards[oldId];
          const newCard = state.cards[newId];
          if (oldCard && newCard) {
            const oldDef = state.definitions[oldCard.definitionId];
            const newDef = state.definitions[newCard.definitionId];
            if (oldDef && newDef) {
              stats.actuallyReplaced++;
              stats.replacements.push({
                turn: state.turnNumber,
                playerId: oldCard.ownerId,
                oldCardId: oldId,
                newCardId: newId,
                oldName: oldDef.name,
                newName: newDef.name,
                oldCost: oldDef.cost,
                newCost: newDef.cost,
                oldHp: oldCard.baseHealth - oldCard.damageTaken,
                newHp: newCard.baseHealth - newCard.damageTaken,
                oldSilenced: oldCard.silenced,
                cheaperAlternativeExists: false,
              });
            }
          }
        }
      }
    },
  });

  if (!r) return null;
  stats.winner = r.winner;
  return stats;
}

// ─── main ───

function pad(s: string, w: number): string {
  return s.length >= w ? s : s + ' '.repeat(w - s.length);
}

function pct(x: number, total: number): string {
  if (total === 0) return '  n/a';
  return `${((x / total) * 100).toFixed(1)}%`;
}

function main(): void {
  const { scopeStr, series, n, botName, deckIds, useMulligan } = parseArgs(
    process.argv.slice(2),
  );
  const decks = decksForScope(scopeStr).filter((d) => deckIds.includes(d.id));

  console.log('═══════════════════════════════════════════════════');
  console.log(`  Replacement analysis`);
  console.log(`  Scope:  ${scopeStr} [${series.join(', ')}]`);
  console.log(`  Bot:    ${botName}${useMulligan ? ' (+ mulligan)' : ''}`);
  console.log(`  Decks:  ${deckIds.join(', ')}`);
  console.log(`  Games:  ${n} per pair`);
  console.log('═══════════════════════════════════════════════════\n');

  const pairs: Array<[string, string]> = [];
  for (const a of deckIds) for (const b of deckIds) pairs.push([a, b]);

  const all: GameStats[] = [];
  const total = pairs.length * n;
  let done = 0;
  const t0 = Date.now();

  for (const [d1, d2] of pairs) {
    const cards1 = decks.find((d) => d.id === d1)!.cards;
    const cards2 = decks.find((d) => d.id === d2)!.cards;
    for (let i = 0; i < n; i++) {
      const seed = `ra-${d1}-${d2}-${i}`;
      const s = collectOneGame(series, [...cards1], [...cards2], seed, botName, useMulligan);
      if (s) all.push(s);
      done++;
      if (done % 50 === 0) {
        process.stdout.write(`\r  running ${done}/${total} …          `);
      }
    }
  }
  process.stdout.write('\r');

  const totalGames = all.length;
  const totalOpportunities = all.reduce((a, s) => a + s.opportunities, 0);
  const totalReplacements = all.reduce((a, s) => a + s.actuallyReplaced, 0);
  const gamesWithOpportunity = all.filter((s) => s.opportunities > 0).length;
  const gamesWithReplacement = all.filter((s) => s.actuallyReplaced > 0).length;

  console.log('─── Сводка ────────────────────────────────────');
  console.log(`  Games:                            ${totalGames}`);
  console.log(`  Games with replacement available: ${gamesWithOpportunity} (${pct(gamesWithOpportunity, totalGames)})`);
  console.log(`  Games with replacement made:      ${gamesWithReplacement} (${pct(gamesWithReplacement, totalGames)})`);
  console.log(`  Total opportunities:              ${totalOpportunities}  (${(totalOpportunities / totalGames).toFixed(2)}/партия)`);
  console.log(`  Total replacements:               ${totalReplacements}  (${(totalReplacements / totalGames).toFixed(2)}/партия)`);
  console.log(`  Utilization rate:                 ${pct(totalReplacements, totalOpportunities)}`);
  console.log('');

  // ─── Winrate с заменой vs без ───
  const gamesWith = all.filter((s) => s.actuallyReplaced > 0 && s.winner !== null);
  const gamesWithout = all.filter((s) => s.actuallyReplaced === 0 && s.winner !== null);

  if (gamesWith.length > 0 || gamesWithout.length > 0) {
    // Считаем winrate по стороне, где произошла замена.
    // Если замена была у P1 — считаем, выиграл ли P1.
    // Если у P2 — выиграл ли P2.
    // Если у обоих — считаем как «замена была, победа любой стороны».
    // Упрощение: считаем, что "с заменой" — это партии, где замена вообще была.
    // Winrate = доля партий, где выиграл тот, у кого была замена.
    const winWith = gamesWith.filter((s) => {
      const replacedByP1 = s.replacements.some((r) => r.playerId === 'p1');
      const replacedByP2 = s.replacements.some((r) => r.playerId === 'p2');
      // Если замена была только у одного — победа этого игрока = win.
      // Если у обоих — считаем как 0.5 (ничья между ними).
      if (replacedByP1 && !replacedByP2) return s.winner === 'p1';
      if (replacedByP2 && !replacedByP1) return s.winner === 'p2';
      return false; // замена у обоих — не считаем
    }).length;

    console.log('─── Партии с заменой ─────────────────────────');
    console.log(`  Games with replacement:  ${gamesWith.length}`);
    console.log(`  Wins by replacer:        ${winWith} (${pct(winWith, gamesWith.length)})`);
    console.log(`  (winrate считается для стороны, сделавшей замену)`);
    console.log('');
  }

  // ─── Детали замен ───
  const allReplacements = all.flatMap((s) => s.replacements);
  if (allReplacements.length > 0) {
    console.log('─── Детали замен (первые 20) ─────────────────');
    for (const r of allReplacements.slice(0, 20)) {
      const silencedNote = r.oldSilenced ? ' 🔇' : '';
      const hpNote = r.oldHp < r.newHp ? ` (+${r.newHp - r.oldHp}HP)` : '';
      console.log(
        `  ${pad(`turn ${r.turn}`, 10)} ${r.playerId}: ` +
          `${pad(r.oldName, 22)} → ${pad(r.newName, 22)}  ` +
          `[${r.oldCost}💰→${r.newCost}💰]${hpNote}${silencedNote}`,
      );
    }
    if (allReplacements.length > 20) {
      console.log(`  … ещё ${allReplacements.length - 20}`);
    }
    console.log('');
  }

  // ─── Интерпретация ───
  console.log('─── Интерпретация ─────────────────────────────');
  const utilization = totalOpportunities > 0 ? totalReplacements / totalOpportunities : 0;
  if (utilization < 0.1) {
    console.log(`  ⚠ Utilization rate ${(utilization * 100).toFixed(1)}% — замена почти не используется.`);
    console.log('    Механика мёртвая: бот предпочитает обычный розыгрыш.');
    console.log('    Стоит снизить стоимость замены (H5a) или дать бонус.');
  } else if (utilization < 0.3) {
    console.log(`  Utilization rate ${(utilization * 100).toFixed(1)}% — используется редко.`);
    console.log('    Возможно, механика ситуативная, но не мёртвая.');
  } else {
    console.log(`  Utilization rate ${(utilization * 100).toFixed(1)}% — используется нормально.`);
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