import type { WritableDraft } from 'immer';
import type { GameState } from '../types/state';
import type { CardInstanceId } from '../types/ids';
import { opponentOf } from '../types/ids';
import { enqueueTrigger } from '../state/triggerEnqueue';

export function notifyAllyAttacked(
  draft: WritableDraft<GameState>,
  targetId: CardInstanceId,
): void {
  const target = draft.cards[targetId];
  if (!target) return;
  const owner = target.controllerId;

  const ids: CardInstanceId[] = [];
  for (const id of Object.keys(draft.cards) as CardInstanceId[]) {
    const card = draft.cards[id];
    if (card.controllerId !== owner) continue;
    if (card.zone !== 'FRONT') continue;
    ids.push(card.instanceId);
  }
  for (const id of ids) {
    if (id === targetId) continue;
    enqueueTrigger(draft, id, 'ON_ALLY_ATTACKED');
  }
}

export function notifyEnemyAttack(
  draft: WritableDraft<GameState>,
  attackerId: CardInstanceId,
): void {
  const attacker = draft.cards[attackerId];
  if (!attacker) return;
  const enemy = opponentOf(attacker.controllerId);

  const ids: CardInstanceId[] = [];
  for (const id of Object.keys(draft.cards) as CardInstanceId[]) {
    const card = draft.cards[id];
    if (card.controllerId !== enemy) continue;
    if (card.zone !== 'FRONT') continue;
    ids.push(card.instanceId);
  }
  for (const id of ids) {
    enqueueTrigger(draft, id, 'ON_ENEMY_ATTACK');
  }
}

export function notifyAllyDied(
  draft: WritableDraft<GameState>,
  deadCardId: CardInstanceId,
): void {
  const dead = draft.cards[deadCardId];
  if (!dead) return;
  const owner = dead.ownerId;

  const ids: CardInstanceId[] = [];
  for (const id of Object.keys(draft.cards) as CardInstanceId[]) {
    const card = draft.cards[id];
    if (card.controllerId !== owner) continue;
    if (card.zone !== 'FRONT') continue;
    if (card.instanceId === deadCardId) continue;
    ids.push(card.instanceId);
  }
  for (const id of ids) {
    enqueueTrigger(draft, id, 'ON_ALLY_DIED');
  }
}