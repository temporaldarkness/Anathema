import type { GameState, CardInstance } from '../types/state';
import type { KeywordId } from '@aspects/cards';
import type { ColumnIndex, PlayerId } from '../types/ids';
import { getColumn } from './helpers';

export function hasAbility(
  state: GameState,
  cardId: CardInstance['instanceId'],
  ability: KeywordId,
): boolean {
  const card = state.cards[cardId];
  if (!card) return false;
  const def = state.definitions[card.definitionId];
  if (!def) return false;
  return def.abilities.includes(ability);
}

export function tauntInColumn(
  state: GameState,
  column: ColumnIndex,
  defenderPlayer: PlayerId,
): CardInstance['instanceId'] | null {
  const col = getColumn(state, column);
  const frontId = defenderPlayer === 'p1' ? col.p1Front : col.p2Front;
  if (!frontId) return null;
  return hasAbility(state, frontId, 'taunt') ? frontId : null;
}

export function canAttackReserve(
  state: GameState,
  attackerId: CardInstance['instanceId'],
  targetColumn: ColumnIndex,
  defenderPlayer: PlayerId,
): boolean {
  const attacker = state.cards[attackerId];
  if (!attacker) return false;
  const col = getColumn(state, targetColumn);
  const frontId = defenderPlayer === 'p1' ? col.p1Front : col.p2Front;
  if (frontId === null) return true;
  return hasAbility(state, attackerId, 'scout');
}