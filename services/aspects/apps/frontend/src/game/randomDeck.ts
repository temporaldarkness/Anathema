import { getCards, type CardDefinition } from '@aspects/cards';
import { validateDeck, MAX_COPIES_PER_PERSONALITY, MAX_LEGENDARY_COPIES } from '@aspects/shared';

/**
 * Случайная колода: 30 карт, соблюдая ограничения.
 *
 * Алгоритм: жадно набираем по одной карте, каждый раз проверяя, что
 * не нарушаем правила. Если попадаем в тупик — перезапускаем.
 * Максимум 50 попыток, обычно укладываемся в 1–3.
 */
export function generateRandomDeck(packId: string): string[] | null {
  const allCards = getCards(packId).filter((c) => !c.isToken);
  if (allCards.length === 0) return null;

  for (let attempt = 0; attempt < 50; attempt++) {
    const result = tryGenerate(allCards);
    if (result) return result;
  }
  return null;
}

function tryGenerate(allCards: CardDefinition[]): string[] | null {
  const deck: string[] = [];
  const personalityCount = new Map<string, number>();
  const legendaryCount = new Map<string, number>();

  while (deck.length < 30) {
    const candidates = allCards.filter((c) => {
      const pc = personalityCount.get(c.personalityTag) ?? 0;
      if (pc >= MAX_COPIES_PER_PERSONALITY) return false;
      if (c.rarity === 'legendary') {
        const lc = legendaryCount.get(c.id) ?? 0;
        if (lc >= MAX_LEGENDARY_COPIES) return false;
      }
      return true;
    });

    if (candidates.length === 0) return null;

    // Слегка предпочитаем карты с меньшим текущим количеством — так
    // кривая получается более разнообразной.
    const weighted: CardDefinition[] = [];
    for (const c of candidates) {
      const pc = personalityCount.get(c.personalityTag) ?? 0;
      // 4 = вес при 0 копиях, 1 = вес при 4 копиях.
      const weight = MAX_COPIES_PER_PERSONALITY - pc;
      for (let i = 0; i < weight; i++) weighted.push(c);
    }

    const pick = weighted[Math.floor(Math.random() * weighted.length)];
    deck.push(pick.id);
    personalityCount.set(
      pick.personalityTag,
      (personalityCount.get(pick.personalityTag) ?? 0) + 1,
    );
    if (pick.rarity === 'legendary') {
      legendaryCount.set(pick.id, (legendaryCount.get(pick.id) ?? 0) + 1);
    }
  }

  // Финальная проверка через настоящий валидатор.
  const v = validateDeck(deck, allCards);
  return v.valid ? deck : null;
}