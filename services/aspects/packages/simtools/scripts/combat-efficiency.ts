#!/usr/bin/env tsx
/**
 * Combat efficiency: сколько атак делают карты за жизнь,
 * сколько умирают не ударив, ATTACK GUILD vs CARD, длина жизни.
 *
 * Usage:
 *   combat-efficiency <scope> <N> [botName] [deck1,deck2,...] [--mulligan]
 */

import type { GameState, Command, GameEvent, CardInstanceId, PlayerId } from '@aspects/engine';
import { frontCount } from '@aspects/engine';
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
    console.error('Usage: combat-efficiency <scope> <N> [botName] [deck1,deck2,...] [--mulligan]');
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

// ─── Сбор статистики одной партии ───

interface CardLifecycle {
  cardId: CardInstanceId;
  defId: string;
  cost: number;
  playTurn: number;
  diedTurn: number | null;
  attacks: number;
  attackedGuild: number;
  attackedCard: number;
}

interface GameStats {
  turns: number;

  // Сыграно карт
  totalPlayed: number;
  // Умерло карт
  totalDied: number;
  // Умерли, не сделав ни одной атаки
  diedWithoutAttack: number;

  // Атак по картам vs по гильдии
  totalCardAttacks: number;
  totalGuildAttacks: number;
  totalNeutralAttacks: number;

  // Время жизни (в ходах)
  lifespansTurns: number[];

  // Сколько атак за жизнь (только для умерших)
  attacksPerLife: number[];

  // Первая атака в партии (turn number)
  firstAttackTurn: number | null;

  // Сколько COMBAT-фаз было у каждого игрока
  p1CombatPhases: number;
  p2CombatPhases: number;

  // Фазы без атак
  combatPhasesWithoutAttack: number;
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
    turns: 0,
    totalPlayed: 0,
    totalDied: 0,
    diedWithoutAttack: 0,
    totalCardAttacks: 0,
    totalGuildAttacks: 0,
    totalNeutralAttacks: 0,
    lifespansTurns: [],
    attacksPerLife: [],
    firstAttackTurn: null,
    p1CombatPhases: 0,
    p2CombatPhases: 0,
    combatPhasesWithoutAttack: 0,
  };

  const lifecycle = new Map<CardInstanceId, CardLifecycle>();

  // Отслеживаем начало COMBAT-фазы
  let inCombat = false;
  let combatPlayer: PlayerId | null = null;
  let attacksThisCombat = 0;

  const r = runOneGameRaw(series, p1Cards, p2Cards, seed, {
    bots: { p1: makeBot(botName), p2: makeBot(botName) },
    useMulligan,
    onAfterCommand: (state, cmd, events) => {
      // Вход/выход COMBAT
      const nowInCombat = state.phase === 'COMBAT';
      if (!inCombat && nowInCombat) {
        inCombat = true;
        combatPlayer = state.activePlayer;
        attacksThisCombat = 0;
        if (combatPlayer === 'p1') stats.p1CombatPhases++;
        else stats.p2CombatPhases++;
      }
      if (inCombat && !nowInCombat) {
        if (attacksThisCombat === 0) stats.combatPhasesWithoutAttack++;
        inCombat = false;
        combatPlayer = null;
      }

      // PLAY_CARD
      if (cmd.type === 'PLAY_CARD') {
        const c = state.cards[cmd.cardId];
        if (c) {
          const def = state.definitions[c.definitionId];
          if (def) {
            lifecycle.set(cmd.cardId, {
              cardId: cmd.cardId,
              defId: c.definitionId,
              cost: def.cost,
              playTurn: state.turnNumber,
              diedTurn: null,
              attacks: 0,
              attackedGuild: 0,
              attackedCard: 0,
            });
            stats.totalPlayed++;
          }
        }
      }

      // ATTACK
      if (cmd.type === 'ATTACK') {
        attacksThisCombat++;
        const attackerLifecycle = lifecycle.get(cmd.attackerId);
        if (attackerLifecycle) {
          attackerLifecycle.attacks++;
          if (cmd.target.kind === 'GUILD') {
            attackerLifecycle.attackedGuild++;
            stats.totalGuildAttacks++;
          } else if (cmd.target.kind === 'CARD') {
            attackerLifecycle.attackedCard++;
            stats.totalCardAttacks++;
          } else if (cmd.target.kind === 'NEUTRAL') {
            stats.totalNeutralAttacks++;
          }
        } else {
          // Атака карты, которую не отследили (например, токен или её играл не PLAY_CARD)
          if (cmd.target.kind === 'GUILD') stats.totalGuildAttacks++;
          else if (cmd.target.kind === 'CARD') stats.totalCardAttacks++;
          else if (cmd.target.kind === 'NEUTRAL') stats.totalNeutralAttacks++;
        }
        if (stats.firstAttackTurn === null) {
          stats.firstAttackTurn = state.turnNumber;
        }
      }

      // CARD_DIED — через events (там точный cardId)
      for (const e of events) {
        if (e.type === 'CARD_DIED') {
          const lc = lifecycle.get(e.cardId);
          if (lc) {
            lc.diedTurn = state.turnNumber;
            stats.totalDied++;
            const lifespan = state.turnNumber - lc.playTurn;
            stats.lifespansTurns.push(lifespan);
            stats.attacksPerLife.push(lc.attacks);
            if (lc.attacks === 0) {
              stats.diedWithoutAttack++;
            }
          } else {
            // Умерла карта не через PLAY_CARD (токен?)
            stats.totalDied++;
            // Не учитываем в lifespan/attacks — они неизвестны
          }
        }
      }
    },
  });

  if (!r) return null;
  stats.turns = r.turns;
  return stats;
}

// ─── main ───

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
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
  console.log(`  Combat efficiency`);
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
      const seed = `ce-${d1}-${d2}-${i}`;
      const s = collectOneGame(series, [...cards1], [...cards2], seed, botName, useMulligan);
      if (s) all.push(s);
      done++;
      if (done % 100 === 0) {
        process.stdout.write(`\r  running ${done}/${total} …          `);
      }
    }
  }
  process.stdout.write('\r');

  // ─── Суммы ───
  const totalGames = all.length;
  const totalPlayed = all.reduce((a, s) => a + s.totalPlayed, 0);
  const totalDied = all.reduce((a, s) => a + s.totalDied, 0);
  const diedWithoutAttack = all.reduce((a, s) => a + s.diedWithoutAttack, 0);
  const totalCardAttacks = all.reduce((a, s) => a + s.totalCardAttacks, 0);
  const totalGuildAttacks = all.reduce((a, s) => a + s.totalGuildAttacks, 0);
  const totalNeutralAttacks = all.reduce((a, s) => a + s.totalNeutralAttacks, 0);
  const totalAttacks = totalCardAttacks + totalGuildAttacks + totalNeutralAttacks;

  const allLifespans = all.flatMap((s) => s.lifespansTurns);
  const allAttacksPerLife = all.flatMap((s) => s.attacksPerLife);
  const firstAttackTurns = all
    .map((s) => s.firstAttackTurn)
    .filter((x): x is number => x !== null);

  const totalP1Phases = all.reduce((a, s) => a + s.p1CombatPhases, 0);
  const totalP2Phases = all.reduce((a, s) => a + s.p2CombatPhases, 0);
  const totalPhasesWithoutAttack = all.reduce((a, s) => a + s.combatPhasesWithoutAttack, 0);

  console.log('─── Сводка ────────────────────────────────────');
  console.log(`  Games:                ${totalGames}`);
  console.log(`  Cards played (всего): ${totalPlayed}  (${(totalPlayed / totalGames).toFixed(1)}/партия)`);
  console.log(`  Cards died (всего):   ${totalDied}`);
  console.log('');

  console.log('─── Судьба карт ───────────────────────────────');
  console.log(`  Умерли без единой атаки:    ${diedWithoutAttack} / ${totalDied}  (${pct(diedWithoutAttack, totalDied)})`);
  console.log(`  Атак на карту (умерших):    ${mean(allAttacksPerLife).toFixed(2)}`);
  console.log(`  Медианная жизнь:            ${(() => {
    const sorted = [...allLifespans].sort((a, b) => a - b);
    if (sorted.length === 0) return 'n/a';
    const m = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? ((sorted[m - 1] + sorted[m]) / 2).toFixed(1) : sorted[m].toFixed(1);
  })()} ходов`);
  console.log(`  Средняя жизнь:              ${mean(allLifespans).toFixed(2)} ходов`);
  console.log('');

  console.log('─── Куда бьют ─────────────────────────────────');
  console.log(`  Атак по картам:     ${totalCardAttacks}  (${pct(totalCardAttacks, totalAttacks)})`);
  console.log(`  Атак по гильдии:    ${totalGuildAttacks}  (${pct(totalGuildAttacks, totalAttacks)})`);
  console.log(`  Атак по нейтралам:  ${totalNeutralAttacks}  (${pct(totalNeutralAttacks, totalAttacks)})`);
  console.log('');

  console.log('─── Атаки по фазам COMBAT ─────────────────────');
  console.log(`  P1 COMBAT-фаз:      ${totalP1Phases}  (${(totalP1Phases / totalGames).toFixed(1)}/партия)`);
  console.log(`  P2 COMBAT-фаз:      ${totalP2Phases}  (${(totalP2Phases / totalGames).toFixed(1)}/партия)`);
  const totalPhases = totalP1Phases + totalP2Phases;
  console.log(`  Фаз без атак:       ${totalPhasesWithoutAttack} / ${totalPhases}  (${pct(totalPhasesWithoutAttack, totalPhases)})`);
  console.log(`  Атак за партию:     ${(totalAttacks / totalGames).toFixed(2)}`);
  console.log(`  Первая атака:       сред. ход ${mean(firstAttackTurns).toFixed(1)}`);
  console.log('');

  // ─── Интерпретация ───
  console.log('─── Интерпретация ─────────────────────────────');
  const diedWithoutAttackPct = diedWithoutAttack / totalDied;
  const avgAttacksPerLife = mean(allAttacksPerLife);
  const medianLifespan = (() => {
    const sorted = [...allLifespans].sort((a, b) => a - b);
    if (sorted.length === 0) return 0;
    const m = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[m - 1] + sorted[m]) / 2 : sorted[m];
  })();
  const faceShare = totalGuildAttacks / totalAttacks;

  if (diedWithoutAttackPct > 0.4) {
    console.log(`  ⚠ ${(diedWithoutAttackPct * 100).toFixed(0)}% карт умирают, не сделав ни одной атаки.`);
    console.log('    Это признак attrition-патов: игра идёт на истощение,');
    console.log('    карты не окупают розыгрыш. Нужны более живучие карты или');
    console.log('    меньший урон в обменах.');
  } else if (diedWithoutAttackPct > 0.25) {
    console.log(`  ${(diedWithoutAttackPct * 100).toFixed(0)}% карт умирают без атак — на грани.`);
  } else {
    console.log(`  ${(diedWithoutAttackPct * 100).toFixed(0)}% карт умирают без атак — нормально.`);
  }

  if (avgAttacksPerLife < 1) {
    console.log(`  ⚠ Карта делает в среднем ${avgAttacksPerLife.toFixed(2)} атак за жизнь.`);
    console.log('    Это меньше 1 — большинство карт умирают не окупив розыгрыш.');
  } else if (avgAttacksPerLife < 1.5) {
    console.log(`  Карта делает ${avgAttacksPerLife.toFixed(2)} атак за жизнь — на грани окупаемости.`);
  } else {
    console.log(`  Карта делает ${avgAttacksPerLife.toFixed(2)} атак за жизнь — окупается.`);
  }

  if (medianLifespan < 2) {
    console.log(`  ⚠ Медианная жизнь карты: ${medianLifespan.toFixed(1)} хода — карты почти не живут.`);
  } else if (medianLifespan < 4) {
    console.log(`  Медианная жизнь ${medianLifespan.toFixed(1)} хода — короткая, но рабочая.`);
  } else {
    console.log(`  Медианная жизнь ${medianLifespan.toFixed(1)} хода — карты живут долго.`);
  }

  if (faceShare > 0.6) {
    console.log(`  ⚠ ${(faceShare * 100).toFixed(0)}% атак — по гильдии. Игнорируют обмен.`);
  } else if (faceShare < 0.3) {
    console.log(`  ${(faceShare * 100).toFixed(0)}% атак по гильдии — играют только в обмен.`);
    console.log('  Возможно, боты не понимают, что пора закрывать.');
  } else {
    console.log(`  ${(faceShare * 100).toFixed(0)}% атак по гильдии — баланс разумный.`);
  }

  const phaseWithAttack = 1 - totalPhasesWithoutAttack / totalPhases;
  if (phaseWithAttack < 0.5) {
    console.log(`  ⚠ Только ${(phaseWithAttack * 100).toFixed(0)}% COMBAT-фаз с атаками.`);
    console.log('    Больше половины фаз — «пустые» (никого не бьют).');
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