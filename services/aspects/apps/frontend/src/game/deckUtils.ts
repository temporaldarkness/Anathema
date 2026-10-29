import type { DeckDto } from '@aspects/shared';
import { mergedCardsById } from '@aspects/cards';

export function isDeckBroken(deck: DeckDto): boolean {
  if (deck.cardIds.length === 0) return false;
  const validDefs = mergedCardsById(deck.series);
  return deck.cardIds.some((id) => !validDefs[id]);
}