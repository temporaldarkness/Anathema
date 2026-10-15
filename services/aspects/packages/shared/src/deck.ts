import { z } from 'zod';

export interface CardForDeckValidation {
  id: string;
  personalityTag: string;
  rarity: string;
  isToken?: boolean;
  series?: string[];
}

export const CreateDeckSchema = z.object({
  name: z.string().min(1).max(64),
  description: z.string().max(200).optional(),
  series: z.array(z.string().min(1)).min(1).max(4),
  cardIds: z.array(z.string()).min(1).max(60),
});

export const UpdateDeckSchema = CreateDeckSchema;

export type CreateDeckDto = z.infer<typeof CreateDeckSchema>;
export type UpdateDeckDto = z.infer<typeof UpdateDeckSchema>;

export interface DeckDto {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  series: string[];
  cardIds: string[];
  createdAt: string;
  updatedAt: string;
}

export type DeckValidationError =
  | { kind: 'WRONG_SIZE'; actual: number; expected: number }
  | { kind: 'UNKNOWN_CARD'; cardId: string }
  | { kind: 'TOKEN_IN_DECK'; cardId: string }
  | {
      kind: 'TOO_MANY_COPIES';
      personalityTag: string;
      count: number;
      max: number;
    }
  | {
      kind: 'TOO_MANY_ASPECT_COPIES';
      cardId: string;
      count: number;
      max: number;
    }
  | {
      kind: 'TOO_MANY_LEGENDARIES';
      cardId: string;
      count: number;
      max: number;
    }
  | {
      kind: 'TOO_MANY_SERIES';
      series: string[];
      count: number;
      max: number;
    }
  | {
      kind: 'CARD_NOT_IN_SELECTED_SERIES';
      cardId: string;
      cardSeries: string[];
      selectedSeries: string[];
    };

export interface DeckValidationResult {
  valid: boolean;
  errors: DeckValidationError[];
}

export const DECK_SIZE = 30;
export const MAX_COPIES_PER_PERSONALITY = 5;
export const MAX_COPIES_PER_ASPECT = 2;
export const MAX_LEGENDARY_COPIES = 1;
export const MAX_SERIES = 4;

export function validateDeck(
  cardIds: string[],
  allCards: CardForDeckValidation[],
  selectedSeries?: string[],
): DeckValidationResult {
  const errors: DeckValidationError[] = [];

  if (cardIds.length !== DECK_SIZE) {
    errors.push({
      kind: 'WRONG_SIZE',
      actual: cardIds.length,
      expected: DECK_SIZE,
    });
  }

  const byId = new Map(allCards.map((c) => [c.id, c]));

  for (const id of cardIds) {
    const def = byId.get(id);
    if (!def) {
      errors.push({ kind: 'UNKNOWN_CARD', cardId: id });
      continue;
    }
    if (def.isToken) {
      errors.push({ kind: 'TOKEN_IN_DECK', cardId: id });
    }
  }

  const aspectCounts = new Map<string, number>();
  for (const id of cardIds) {
    if (!byId.has(id)) continue;
    aspectCounts.set(id, (aspectCounts.get(id) ?? 0) + 1);
  }
  for (const [id, count] of aspectCounts) {
    if (count > MAX_COPIES_PER_ASPECT) {
      errors.push({
        kind: 'TOO_MANY_ASPECT_COPIES',
        cardId: id,
        count,
        max: MAX_COPIES_PER_ASPECT,
      });
    }
  }

  const personalityCounts = new Map<string, number>();
  for (const id of cardIds) {
    const def = byId.get(id);
    if (!def) continue;
    const tag = def.personalityTag;
    personalityCounts.set(tag, (personalityCounts.get(tag) ?? 0) + 1);
  }
  for (const [tag, count] of personalityCounts) {
    if (count > MAX_COPIES_PER_PERSONALITY) {
      errors.push({
        kind: 'TOO_MANY_COPIES',
        personalityTag: tag,
        count,
        max: MAX_COPIES_PER_PERSONALITY,
      });
    }
  }

  const legendaryCounts = new Map<string, number>();
  for (const id of cardIds) {
    const def = byId.get(id);
    if (!def || def.rarity !== 'legendary') continue;
    legendaryCounts.set(id, (legendaryCounts.get(id) ?? 0) + 1);
  }
  for (const [id, count] of legendaryCounts) {
    if (count > MAX_LEGENDARY_COPIES) {
      errors.push({
        kind: 'TOO_MANY_LEGENDARIES',
        cardId: id,
        count,
        max: MAX_LEGENDARY_COPIES,
      });
    }
  }

  if (selectedSeries && selectedSeries.length > 0) {
    if (selectedSeries.length > MAX_SERIES) {
      errors.push({
        kind: 'TOO_MANY_SERIES',
        series: selectedSeries,
        count: selectedSeries.length,
        max: MAX_SERIES,
      });
    }

    const selectedSet = new Set(selectedSeries);
    for (const id of cardIds) {
      const def = byId.get(id);
      if (!def) continue;
      const cardSeries = def.series ?? [];
      const intersects = cardSeries.some((s) => selectedSet.has(s));
      if (!intersects) {
        errors.push({
          kind: 'CARD_NOT_IN_SELECTED_SERIES',
          cardId: id,
          cardSeries,
          selectedSeries,
        });
      }
    }
  } else {
    const seriesSet = new Set<string>();
    for (const id of cardIds) {
      const def = byId.get(id);
      if (!def) continue;
      for (const s of def.series ?? []) seriesSet.add(s);
    }
    if (seriesSet.size > MAX_SERIES) {
      errors.push({
        kind: 'TOO_MANY_SERIES',
        series: [...seriesSet],
        count: seriesSet.size,
        max: MAX_SERIES,
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

export function errorText(err: DeckValidationError): string {
  switch (err.kind) {
    case 'WRONG_SIZE':
      return `Колода должна содержать ${err.expected} карт, сейчас ${err.actual}`;
    case 'UNKNOWN_CARD':
      return `Неизвестная карта: ${err.cardId}`;
    case 'TOKEN_IN_DECK':
      return `Токен нельзя положить в колоду: ${err.cardId}`;
    case 'TOO_MANY_COPIES':
      return `Слишком много копий личности ${err.personalityTag}: ${err.count} (макс ${err.max})`;
    case 'TOO_MANY_ASPECT_COPIES':
      return `Слишком много копий аспекта ${err.cardId}: ${err.count} (макс ${err.max})`;
    case 'TOO_MANY_LEGENDARIES':
      return `Слишком много копий легендарки ${err.cardId}: ${err.count} (макс ${err.max})`;
    case 'TOO_MANY_SERIES':
      return `Слишком много серий: ${err.count} (макс ${err.max}). Серии: ${err.series.join(', ')}`;
    case 'CARD_NOT_IN_SELECTED_SERIES':
      return `Карта ${err.cardId} не из выбранных серий (${err.selectedSeries.join(', ')})`;
  }
}