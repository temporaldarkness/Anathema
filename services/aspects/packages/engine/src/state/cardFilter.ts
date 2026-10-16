import type { CardFilter } from '@aspects/cards';
import type { GameState } from '../types/state';
import type { CardInstanceId } from '../types/ids';
import { cardAbilities } from './helpers';

export function matchesFilter(
  state: GameState,
  cardId: CardInstanceId,
  filter: CardFilter | undefined,
): boolean {
  if (!filter) return true;
  const card = state.cards[cardId];
  if (!card) return false;
  const def = state.definitions[card.definitionId];
  if (!def) return false;

  if (filter.tag !== undefined) {
    if (!(def.tags ?? []).includes(filter.tag)) return false;
  }
  if (filter.keyword !== undefined) {
    if (!cardAbilities(state, cardId).includes(filter.keyword)) return false;
  }
  if (filter.withoutShield && card.shieldAvailable) return false;

  if (filter.minStrength !== undefined || filter.maxStrength !== undefined) {
    let s = card.baseStrength;
    for (const m of card.modifiers) {
      if (m.stat === 'strength') s += m.delta;
    }
    s = Math.max(0, s);
    if (filter.minStrength !== undefined && s < filter.minStrength) return false;
    if (filter.maxStrength !== undefined && s > filter.maxStrength) return false;
  }

  if (filter.minCost !== undefined && def.cost < filter.minCost) return false;
  if (filter.maxCost !== undefined && def.cost > filter.maxCost) return false;

  return true;
}