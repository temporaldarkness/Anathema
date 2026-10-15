import {
  validateDeck,
  MAX_COPIES_PER_PERSONALITY,
  MAX_COPIES_PER_ASPECT,
  MAX_LEGENDARY_COPIES,
  type CardForDeckValidation,
} from './deck';

export interface RandomDeckOptions {
  size?: number;
}

export function generateRandomDeck(
  cards: CardForDeckValidation[],
  options: RandomDeckOptions = {},
): string[] | null {
  const size = options.size ?? 30;
  const pool = cards.filter((c) => !c.isToken);
  if (pool.length === 0) return null;

  for (let attempt = 0; attempt < 50; attempt++) {
    const result = tryGenerate(pool, size);
    if (result) return result;
  }
  return null;
}

function tryGenerate(
  pool: CardForDeckValidation[],
  size: number,
): string[] | null {
  const deck: string[] = [];
  const personalityCount = new Map<string, number>();
  const aspectCount = new Map<string, number>();
  const legendaryCount = new Map<string, number>();

  while (deck.length < size) {
    const candidates = pool.filter((c) => {
      if ((personalityCount.get(c.personalityTag) ?? 0) >= MAX_COPIES_PER_PERSONALITY)
        return false;
      if ((aspectCount.get(c.id) ?? 0) >= MAX_COPIES_PER_ASPECT) return false;
      if (c.rarity === 'legendary') {
        if ((legendaryCount.get(c.id) ?? 0) >= MAX_LEGENDARY_COPIES)
          return false;
      }
      return true;
    });

    if (candidates.length === 0) return null;

    const weighted: CardForDeckValidation[] = [];
    for (const c of candidates) {
      const pc = personalityCount.get(c.personalityTag) ?? 0;
      const weight = Math.max(1, MAX_COPIES_PER_PERSONALITY - pc);
      for (let i = 0; i < weight; i++) weighted.push(c);
    }

    const pick = weighted[Math.floor(Math.random() * weighted.length)];
    deck.push(pick.id);
    personalityCount.set(
      pick.personalityTag,
      (personalityCount.get(pick.personalityTag) ?? 0) + 1,
    );
    aspectCount.set(pick.id, (aspectCount.get(pick.id) ?? 0) + 1);
    if (pick.rarity === 'legendary') {
      legendaryCount.set(pick.id, (legendaryCount.get(pick.id) ?? 0) + 1);
    }
  }

  const v = validateDeck(deck, pool);
  return v.valid ? deck : null;
}