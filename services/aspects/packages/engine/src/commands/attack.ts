import type { WritableDraft } from 'immer';
import type { GameState } from '../types/state';
import type { ResolutionContext } from '../types/resolution';
import type { AttackTarget } from '../types/commands';
import type { CardInstanceId, ColumnIndex, PlayerId } from '../types/ids';
import { opponentOf } from '../types/ids';
import {
  columnBonuses,
  findCardLocation,
  frontCount,
  getColumn,
  strengthInBattle,
  canAttackMore,
  maxAttacksFor,
  cardAbilities
} from '../state/helpers';
import { hasAbility, canAttackReserve, tauntInColumn } from '../state/abilities';
import { damageCard } from '../state/damage';
import { damageGlory, killCard } from '../state/mutations';
import { enqueueTrigger } from '../state/triggerEnqueue';
import { drainTriggerQueue } from '../abilities/triggerQueue';
import { notifyAllyAttacked, notifyEnemyAttack } from '../abilities/reactions';
import { notifyCellCaptured, notifyCellLost } from '../abilities/cellEvents';

export interface AttackParams {
  playerId: PlayerId;
  attackerId: CardInstanceId;
  target: AttackTarget;
}

export function attackInternal(
  draft: WritableDraft<GameState>,
  params: AttackParams,
  ctx: ResolutionContext,
): { ok: true } | { ok: false; reason: string } {
  const { playerId, attackerId, target } = params;

  if (draft.activePlayer !== playerId) return { ok: false, reason: 'not_your_turn' };
  if (draft.phase !== 'COMBAT') return { ok: false, reason: 'not_combat_phase' };

  const attacker = draft.cards[attackerId];
  if (!attacker) return { ok: false, reason: 'attacker_not_found' };
  if (attacker.ownerId !== playerId) return { ok: false, reason: 'not_your_card' };

  const loc = findCardLocation(draft as GameState, attackerId);
  if (!loc || loc.zone !== 'FRONT') return { ok: false, reason: 'attacker_not_in_front' };
  if (!canAttackMore(draft as GameState, attackerId)) {
    return { ok: false, reason: 'attacker_exhausted' };
  }

  const defender: PlayerId = opponentOf(playerId);

  switch (target.kind) {
    case 'CARD':
      return attackCard(draft, attackerId, target.cardId, defender, ctx);
    case 'NEUTRAL':
      return attackNeutral(draft, attackerId, target.column, ctx);
    case 'GUILD':
      return attackGuild(draft, attackerId, defender, ctx);
  }
}

function attackCard(
  draft: WritableDraft<GameState>,
  attackerId: CardInstanceId,
  targetId: CardInstanceId,
  defender: PlayerId,
  ctx: ResolutionContext,
): { ok: true } | { ok: false; reason: string } {
  const attacker = draft.cards[attackerId];
  const target = draft.cards[targetId];
  if (!target) return { ok: false, reason: 'target_not_found' };
  if (target.ownerId !== defender) return { ok: false, reason: 'target_not_enemy' };

  const targetLoc = findCardLocation(draft as GameState, targetId);
  if (!targetLoc) return { ok: false, reason: 'target_not_on_board' };

  const attackerLoc = findCardLocation(draft as GameState, attackerId)!;
  const tauntId = tauntInColumn(draft as GameState, attackerLoc.column, defender);
  if (tauntId && !hasAbility(draft as GameState, attackerId, 'scout')) {
    if (targetId !== tauntId) return { ok: false, reason: 'taunt_blocks' };
  }

  if (targetLoc.zone === 'RESERVE') {
    if (!canAttackReserve(draft as GameState, attackerId, targetLoc.column, defender)) {
      return { ok: false, reason: 'front_blocks_reserve' };
    }
  }

  enqueueTrigger(draft, attackerId, 'ON_ATTACK');
  drainTriggerQueue(draft, ctx);

  const liveAttacker = draft.cards[attackerId];
  if (!liveAttacker || liveAttacker.zone === 'DISCARD') {
    return { ok: true };
  }

  notifyEnemyAttack(draft, attackerId);
  notifyAllyAttacked(draft, targetId, attackerId);

  resolveCombat(draft, attackerId, targetId, ctx);

  consumeAttack(draft, attackerId, ctx);
  return { ok: true };
}

function consumeAttack(
  draft: WritableDraft<GameState>,
  attackerId: CardInstanceId,
  ctx: ResolutionContext,
): void {
  const card = draft.cards[attackerId];
  if (!card) return;
  if (card.zone !== 'FRONT') return;
  card.attacksThisTurn += 1;
  const max = maxAttacksFor(draft as GameState, attackerId);
  if (card.attacksThisTurn >= max && !card.exhausted) {
    card.exhausted = true;
    ctx.events.push({ type: 'CARD_EXHAUSTED', cardId: attackerId });
  }
}

/**
 * Собирает соседей цели по колонкам (column ± 1) в той же зоне.
 * Возвращает только тех, кто на момент вызова жив и на доске.
 */
function collectCleaveTargets(
  draft: WritableDraft<GameState>,
  targetLoc: { column: ColumnIndex; zone: 'FRONT' | 'RESERVE'; ownerId: PlayerId },
): CardInstanceId[] {
  const result: CardInstanceId[] = [];
  const zone = targetLoc.zone;
  const owner = targetLoc.ownerId;

  for (const delta of [-1, 1]) {
    const c = targetLoc.column + delta;
    if (c < 1 || c > 5) continue;
    const col = draft.board[c - 1];
    let id: CardInstanceId | null = null;
    if (zone === 'FRONT') {
      id = owner === 'p1' ? col.p1Front : col.p2Front;
    } else {
      id = owner === 'p1' ? col.p1Reserve : col.p2Reserve;
    }
    if (id) result.push(id);
  }
  return result;
}

function resolveCombat(
  draft: WritableDraft<GameState>,
  attackerId: CardInstanceId,
  targetId: CardInstanceId,
  ctx: ResolutionContext,
): void {
  const attacker = draft.cards[attackerId];
  const target = draft.cards[targetId];
  if (!attacker || !target) return;

  const abilities = cardAbilities(draft as GameState, attackerId);
  const hasCleave = abilities.includes('cleave');
  const attackerDef = draft.definitions[attacker.definitionId];
  const cleaveDamage = hasCleave ? (attackerDef?.cleaveDamage ?? 1) : 0;

  const attStrength = strengthInBattle(draft as GameState, attackerId);
  const defStrength = strengthInBattle(draft as GameState, targetId);
  const attackerHasBreakthrough = hasAbility(draft as GameState, attackerId, 'breakthrough');
  const targetLoc = findCardLocation(draft as GameState, targetId);

  // Соседей собираем ДО основного урона: target может умереть, слот опустеет.
  const cleaveTargets =
    hasCleave && cleaveDamage > 0 && targetLoc
      ? collectCleaveTargets(draft, targetLoc)
      : [];

  const targetResult = damageCard(draft, targetId, attStrength, attackerId, ctx);

  if (targetResult.killed && attackerHasBreakthrough && targetLoc?.zone === 'FRONT') {
    const col = getColumn(draft as GameState, targetLoc.column);
    const reserveKey = targetLoc.ownerId === 'p1' ? 'p1Reserve' : 'p2Reserve';
    const reserveId = (col as any)[reserveKey];
    if (reserveId && targetResult.overflow > 0) {
      const reserveResult = damageCard(draft, reserveId, targetResult.overflow, attackerId, ctx);
      if (reserveResult.killed) {
        enqueueTrigger(draft, attackerId, 'ON_KILL');
        killCard(draft, reserveId, ctx);
      }
    }
  }

  if (targetResult.killed) {
    enqueueTrigger(draft, attackerId, 'ON_KILL');
    killCard(draft, targetId, ctx);
  }

  // Cleave-урон по соседям. Не активирует breakthrough, соседи
  // не отвечают ответным ударом.
  for (const sid of cleaveTargets) {
    const sc = draft.cards[sid];
    if (!sc || sc.zone === 'DISCARD') continue;
    const r = damageCard(draft, sid, cleaveDamage, attackerId, ctx);
    if (r.killed) {
      enqueueTrigger(draft, attackerId, 'ON_KILL');
      killCard(draft, sid, ctx);
    }
  }

  const attackerResult = damageCard(draft, attackerId, defStrength, targetId, ctx);
  if (attackerResult.killed) killCard(draft, attackerId, ctx);

  const liveTarget = draft.cards[targetId];
  if (liveTarget && liveTarget.zone !== 'DISCARD' && !liveTarget.exhausted) {
    liveTarget.exhausted = true;
    ctx.events.push({ type: 'CARD_EXHAUSTED', cardId: targetId });
  }

  drainTriggerQueue(draft, ctx);
}

function attackNeutral(
  draft: WritableDraft<GameState>,
  attackerId: CardInstanceId,
  column: ColumnIndex,
  ctx: ResolutionContext,
): { ok: true } | { ok: false; reason: string } {
  const attacker = draft.cards[attackerId];
  const attackerLoc = findCardLocation(draft as GameState, attackerId)!;

  if (attackerLoc.column !== column) return { ok: false, reason: 'neutral_column_mismatch' };

  const col = getColumn(draft as GameState, column);
  const defender: PlayerId = opponentOf(attacker.ownerId);

  if (col.neutralOwner === attacker.ownerId) return { ok: false, reason: 'already_controlled' };

  const defFrontKey = defender === 'p1' ? 'p1Front' : 'p2Front';
  const defFrontId = (col as any)[defFrontKey] as CardInstanceId | null;

  enqueueTrigger(draft, attackerId, 'ON_ATTACK');
  drainTriggerQueue(draft, ctx);

  const liveAttacker0 = draft.cards[attackerId];
  if (!liveAttacker0 || liveAttacker0.zone === 'DISCARD') {
    return { ok: true };
  }

  if (!defFrontId) {
    captureNeutral(draft, column, attacker.ownerId, ctx);
  } else {
    const defCard = draft.cards[defFrontId];
    if (defCard.exhausted) {
      captureNeutral(draft, column, attacker.ownerId, ctx);
    } else {
      const attStr = strengthInBattle(draft as GameState, attackerId);
      const defStr = strengthInBattle(draft as GameState, defFrontId);

      const targetResult = damageCard(draft, defFrontId, attStr, attackerId, ctx);
      if (targetResult.killed) {
        enqueueTrigger(draft, attackerId, 'ON_KILL');
        killCard(draft, defFrontId, ctx);
      }

      const attResult = damageCard(draft, attackerId, defStr, defFrontId, ctx);
      if (attResult.killed) killCard(draft, attackerId, ctx);

      const defAlive = draft.cards[defFrontId]?.zone !== 'DISCARD';
      const attAlive = draft.cards[attackerId]?.zone !== 'DISCARD';

      if (!defAlive && attAlive) {
        ctx.pendingNeutralCaptures.push({
          column,
          playerId: attacker.ownerId,
          attackerId,
        });
      }

      const liveDef = draft.cards[defFrontId];
      if (liveDef && liveDef.zone !== 'DISCARD' && !liveDef.exhausted) {
        liveDef.exhausted = true;
        ctx.events.push({ type: 'CARD_EXHAUSTED', cardId: defFrontId });
      }
    }
  }

  consumeAttack(draft, attackerId, ctx);

  drainTriggerQueue(draft, ctx);
  return { ok: true };
}

function captureNeutral(
  draft: WritableDraft<GameState>,
  column: ColumnIndex,
  newOwner: PlayerId,
  ctx: ResolutionContext,
): void {
  const col = draft.board[column - 1];
  const oldOwner = col.neutralOwner;
  if (oldOwner === newOwner) return;

  col.neutralOwner = newOwner;

  if (oldOwner) {
    ctx.events.push({ type: 'NEUTRAL_LOST', column, formerOwner: oldOwner });
    notifyCellLost(draft, column, oldOwner);
  }
  ctx.events.push({ type: 'NEUTRAL_CAPTURED', column, playerId: newOwner });
  notifyCellCaptured(draft, column, newOwner);
}

function attackGuild(
  draft: WritableDraft<GameState>,
  attackerId: CardInstanceId,
  defender: PlayerId,
  ctx: ResolutionContext,
): { ok: true } | { ok: false; reason: string } {
  const attacker = draft.cards[attackerId];

  if (frontCount(draft as GameState, defender) > 0) {
    return { ok: false, reason: 'front_not_empty' };
  }

  enqueueTrigger(draft, attackerId, 'ON_ATTACK');
  drainTriggerQueue(draft, ctx);

  const liveAttacker = draft.cards[attackerId];
  if (!liveAttacker || liveAttacker.zone === 'DISCARD') {
    return { ok: true };
  }

  const dmg = strengthInBattle(draft as GameState, attackerId);
  damageGlory(draft, defender, dmg, ctx);

  consumeAttack(draft, attackerId, ctx);

  return { ok: true };
}