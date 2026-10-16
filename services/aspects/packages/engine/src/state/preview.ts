import type { GameState } from '../types/state';
import type { CardInstanceId } from '../types/ids';
import { columnBonuses, findCardLocation, health, strength } from './helpers';
import { getValidActions } from './validActions';
import type { AttackTarget } from '../types/commands';
import { applyCommand } from '../commands/applyCommand';
import type { GameEvent } from '../types/events';
import { randomIndex } from './rng';

export interface CardAttackPreview {
  attackerDies: boolean;
  defenderDies: boolean;
  /** Фактический урон по защитнику (после щита и защиты колонки 4). */
  damageToDefender: number;
  /** Фактический урон по атакующему (ответка после щита и защиты). */
  damageToAttacker: number;
  /** Избыток урона, уходящий в Резерв (Прорыв). 0 — если нет. */
  overkillToReserve: number;
  hasBreakthrough: boolean;
  /** Щит защитника полностью поглотил удар. */
  shieldBlocks: boolean;
  defenderHpBefore: number;
  defenderHpAfter: number;
  attackerHpBefore: number;
  attackerHpAfter: number;
}

/**
 * Предсказать исход боя между двумя картами без изменения state.
 * Возвращает null, если любая из карт не найдена на доске.
 *
 * Учитывает:
 *  - щит (поглощает первый урон — у защитника, и ответку — у атакующего);
 *  - защиту колонки 4 (снижает входящий урон на 1);
 *  - бонус колонки 2 (+1 силы во Фронте);
 *  - модификаторы (подавление, баффы);
 *  - Прорыв (избыток урона в Резерв).
 *
 * НЕ учитывает:
 *  - реакции ON_EXIT / ON_THIS_DAMAGED / ON_ALLY_* — они срабатывают
 *    ПОСЛЕ боя и могут изменить итог (например, убить атакующего);
 *  - нейтрал-клетки и гильдию (для этого используй отдельную логику).
 */
export function previewCardAttack(
  state: GameState,
  attackerId: CardInstanceId,
  defenderId: CardInstanceId,
): CardAttackPreview | null {
  const attacker = state.cards[attackerId];
  const defender = state.cards[defenderId];
  if (!attacker || !defender) return null;

  const attackerLoc = findCardLocation(state, attackerId);
  const defenderLoc = findCardLocation(state, defenderId);
  if (!attackerLoc || !defenderLoc) return null;

  let attStrength = strength(attacker);
  if (attackerLoc.zone === 'FRONT') {
    attStrength += columnBonuses(state, attacker.ownerId).strengthBonus;
  }
  attStrength = Math.max(0, attStrength);

  let defStrength = strength(defender);
  if (defenderLoc.zone === 'FRONT') {
    defStrength += columnBonuses(state, defender.ownerId).strengthBonus;
  }
  defStrength = Math.max(0, defStrength);

  const defReduction = columnBonuses(state, defender.ownerId).damageReduction;
  const attReduction = columnBonuses(state, attacker.ownerId).damageReduction;

  let damageToDefender = 0;
  let shieldBlocks = false;
  if (defender.shieldAvailable) {
    shieldBlocks = true;
  } else {
    damageToDefender = Math.max(0, attStrength - defReduction);
  }

  const defenderHpBefore = health(defender);
  const defenderHpAfter = defenderHpBefore - damageToDefender;
  const defenderDies = defenderHpAfter <= 0;

  let damageToAttacker = 0;
  if (!attacker.shieldAvailable) {
    damageToAttacker = Math.max(0, defStrength - attReduction);
  }

  const attackerHpBefore = health(attacker);
  const attackerHpAfter = attackerHpBefore - damageToAttacker;
  const attackerDies = attackerHpAfter <= 0;

  const attackerDef = state.definitions[attacker.definitionId];
  const hasBreakthrough = (attackerDef?.abilities ?? []).includes('breakthrough');
  let overkillToReserve = 0;
  if (hasBreakthrough && defenderDies && defenderLoc.zone === 'FRONT') {
    overkillToReserve = -defenderHpAfter;
  }

  return {
    attackerDies,
    defenderDies,
    damageToDefender,
    damageToAttacker,
    overkillToReserve,
    hasBreakthrough,
    shieldBlocks,
    defenderHpBefore,
    defenderHpAfter,
    attackerHpBefore,
    attackerHpAfter,
  };
}

/**
 * Все валидные цели для конкретного атакующего в текущем состоянии.
 * Использует getValidActions — гарантированно возвращает только
 * команды, которые движок не отклонит.
 */
export function getValidAttackTargets(
  state: GameState,
  attackerId: CardInstanceId,
): AttackTarget[] {
  const attacker = state.cards[attackerId];
  if (!attacker) return [];
  const playerId = attacker.ownerId;
  const actions = getValidActions(state, playerId);
  const targets: AttackTarget[] = [];
  for (const a of actions) {
    if (a.type === 'ATTACK' && a.attackerId === attackerId) {
      targets.push(a.target);
    }
  }
  return targets;
}

export interface AttackSimResult {
  state: GameState;
  events: GameEvent[];
  /** Установлено ли pendingChoice после атаки (реакции требовали выбора). */
  pendingChoice: boolean;
}

/**
 * Симулировать атаку без изменения текущего state.
 *
 * Возвращает:
 *   - null, если атака нелегальна или state уже в winner/pendingChoice;
 *   - новый state + events, если атака прошла.
 *
 * ВАЖНО: если после атаки установлено pendingChoice (реакция запросила
 * выбор цели или сброс), то результат считается «непростым» — обычные
 * функции оценки не смогут его обработать. Проверяй поле pendingChoice.
 */
export function simulateAttack(
  state: GameState,
  attackerId: CardInstanceId,
  target: AttackTarget,
): AttackSimResult | null {
  if (state.winner) return null;
  if (state.pendingChoice) return null;

  const attacker = state.cards[attackerId];
  if (!attacker) return null;
  if (attacker.ownerId !== state.activePlayer) return null;
  if (state.phase !== 'COMBAT') return null;

  const r = applyCommand(state, {
    type: 'ATTACK',
    playerId: attacker.ownerId,
    attackerId,
    target,
  });

  if (r.events.some((e) => e.type === 'COMMAND_REJECTED')) return null;

  return {
    state: r.state,
    events: r.events,
    pendingChoice: r.state.pendingChoice !== null,
  };
}

/**
 * Симулировать атаку + автоматически разрешить pendingChoice
 * (первым валидным вариантом). Удобно для lookahead: результат —
 * полноценный state без ожидающих решений.
 *
 * Если pendingChoice требует >1 карты (END_TURN_DISCARD),
 * автоматически сбрасываются первые N из eligible.
 *
 * Возвращает null, если атака нелегальна.
 */
export function simulateAttackFully(
  state: GameState,
  attackerId: CardInstanceId,
  target: AttackTarget,
): AttackSimResult | null {
  let sim = simulateAttack(state, attackerId, target);
  if (!sim) return null;

  let safety = 10;
  while (sim.state.pendingChoice && safety-- > 0) {
    const choice = sim.state.pendingChoice;

    if (choice.kind === 'EFFECT_TARGET_SELECTION') {
      // Отмена — безопаснее всего для lookahead.
      const r = applyCommand(sim.state, {
        type: 'RESOLVE_CHOICE',
        playerId: choice.playerId,
        cardIds: [],
      });
      sim = { ...sim, state: r.state, events: [...sim.events, ...r.events] };
    } else if (choice.kind === 'END_TURN_DISCARD') {
      const r = applyCommand(sim.state, {
        type: 'RESOLVE_CHOICE',
        playerId: choice.playerId,
        cardIds: choice.eligibleCardIds.slice(0, choice.count),
      });
      sim = { ...sim, state: r.state, events: [...sim.events, ...r.events] };
    } else {
      // REPLACE_TARGET_SELECTION — в симуляции атаки замен не бывает,
      // но если выбор всплыл, безопаснее отменить его без трат Влияния.
      const r = applyCommand(sim.state, {
        type: 'CANCEL_CHOICE',
        playerId: choice.playerId,
      });
      sim = { ...sim, state: r.state, events: [...sim.events, ...r.events] };
    }
  }

  return sim;
}

export interface AttackSequenceResult {
  state: GameState;
  events: GameEvent[];
  /** true, если на каком-то шаге атака провалилась — цепочка оборвана. */
  broken: boolean;
}

/**
 * Симулировать цепочку атак последовательно, обновляя состояние
 * между шагами. Удобно для lookahead на 2+ атаки.
 *
 * Пример:
 *   simulateAttackChain(state, [
 *     { attackerId: 'c12', target: { kind: 'CARD', cardId: 'c45' } },
 *     { attackerId: 'c13', target: { kind: 'GUILD', playerId: 'p2' } },
 *   ])
 */
export function simulateAttackChain(
  state: GameState,
  attacks: Array<{ attackerId: CardInstanceId; target: AttackTarget }>,
): AttackSequenceResult {
  let current = state;
  const allEvents: GameEvent[] = [];
  let broken = false;

  for (const step of attacks) {
    const sim = simulateAttackFully(current, step.attackerId, step.target);
    if (!sim) {
      broken = true;
      break;
    }
    current = sim.state;
    allEvents.push(...sim.events);
    if (current.winner) break;
  }

  return { state: current, events: allEvents, broken };
}