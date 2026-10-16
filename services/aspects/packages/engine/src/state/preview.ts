import type { GameState } from '../types/state';
import type { CardInstanceId } from '../types/ids';
import { cardAbilities, columnBonuses, findCardLocation, health, strength } from './helpers';
import { getValidActions } from './validActions';
import type { AttackTarget } from '../types/commands';
import { applyCommand } from '../commands/applyCommand';
import type { GameEvent } from '../types/events';

export interface CardAttackPreview {
  attackerDies: boolean;
  defenderDies: boolean;
  /** Фактический урон по защитнику (после щита, защиты колонки 4 и брони). */
  damageToDefender: number;
  /** Фактический урон по атакующему (ответка после щита, защиты и брони). */
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
  /** Сколько урона поглотила броня защитника (0 или 1). */
  defenderArmorReduction: number;
  /** Сколько урона поглотила броня атакующего на ответке (0 или 1). */
  attackerArmorReduction: number;
  /** Cleave: сколько соседей цели получит урон. */
  cleaveTargetCount: number;
  /** Cleave: урон на каждого соседа. */
  cleaveDamagePerTarget: number;
  /** Cleave: сколько соседей умрёт от cleave-урона. */
  cleaveKills: number;
}

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

  const attAbilities = cardAbilities(state, attackerId);
  const defAbilities = cardAbilities(state, defenderId);

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
  const defenderArmorReduction = defAbilities.includes('armored') ? 1 : 0;
  const attackerArmorReduction = attAbilities.includes('armored') ? 1 : 0;

  let damageToDefender = 0;
  let shieldBlocks = false;
  if (defender.shieldAvailable) {
    shieldBlocks = true;
  } else {
    damageToDefender = Math.max(
      0,
      attStrength - defReduction - defenderArmorReduction,
    );
  }

  const defenderHpBefore = health(defender);
  const defenderHpAfter = defenderHpBefore - damageToDefender;
  const defenderDies = defenderHpAfter <= 0;

  let damageToAttacker = 0;
  if (!attacker.shieldAvailable) {
    damageToAttacker = Math.max(
      0,
      defStrength - attReduction - attackerArmorReduction,
    );
  }

  const attackerHpBefore = health(attacker);
  const attackerHpAfter = attackerHpBefore - damageToAttacker;
  const attackerDies = attackerHpAfter <= 0;

  const attackerDef = state.definitions[attacker.definitionId];
  const hasBreakthrough = attAbilities.includes('breakthrough');
  let overkillToReserve = 0;
  if (hasBreakthrough && defenderDies && defenderLoc.zone === 'FRONT') {
    overkillToReserve = -defenderHpAfter;
  }

  // Cleave: соседи цели по колонкам (в той же зоне владельца цели).
  const hasCleave = attAbilities.includes('cleave');
  const cleaveDamagePerTarget = hasCleave ? (attackerDef?.cleaveDamage ?? 1) : 0;
  let cleaveTargetCount = 0;
  let cleaveKills = 0;
  if (hasCleave && cleaveDamagePerTarget > 0) {
    for (const delta of [-1, 1]) {
      const c = defenderLoc.column + delta;
      if (c < 1 || c > 5) continue;
      const col = state.board[c - 1];
      const id = defenderLoc.zone === 'FRONT'
        ? (defenderLoc.ownerId === 'p1' ? col.p1Front : col.p2Front)
        : (defenderLoc.ownerId === 'p1' ? col.p1Reserve : col.p2Reserve);
      if (!id || id === defenderId) continue;
      const nb = state.cards[id];
      if (!nb) continue;
      cleaveTargetCount++;
      const nbAbilities = cardAbilities(state, id);
      const nbArmor = nbAbilities.includes('armored') ? 1 : 0;
      const nbReduction = columnBonuses(state, nb.ownerId).damageReduction;
      let nbDamage = 0;
      if (!nb.shieldAvailable) {
        nbDamage = Math.max(0, cleaveDamagePerTarget - nbReduction - nbArmor);
      }
      const nbHpBefore = health(nb);
      if (nbHpBefore - nbDamage <= 0) cleaveKills++;
    }
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
    defenderArmorReduction,
    attackerArmorReduction,
    cleaveTargetCount,
    cleaveDamagePerTarget,
    cleaveKills,
  };
}

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
  pendingChoice: boolean;
}

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
    } else if (
      choice.kind === 'END_TURN_DISCARD' ||
      choice.kind === 'DISCARD_CHOSEN'
    ) {
      const r = applyCommand(sim.state, {
        type: 'RESOLVE_CHOICE',
        playerId: choice.playerId,
        cardIds: choice.eligibleCardIds.slice(0, choice.count),
      });
      sim = { ...sim, state: r.state, events: [...sim.events, ...r.events] };
    } else {
      // REPLACE_TARGET_SELECTION / ACTIVATION_DISCARD — отменяем без трат.
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
  broken: boolean;
}

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