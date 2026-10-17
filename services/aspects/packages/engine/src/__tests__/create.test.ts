import { describe, it, expect } from 'vitest';
import { createGame } from '../state/create';
import { health, strength, controlledCells, frontCount, findCardLocation } from '../state/helpers';
import type { CardDefinition } from '@aspects/cards';
import { CardDefinitionSchema, ALL_CARDS, STORMWIND_ASPECTS, VOIDFLAME_ASPECTS, LEGENDARY_ASPECTS } from '@aspects/cards';

const defs: Record<string, CardDefinition> = {
  guard: {
    id: 'guard',
    name: 'Стражник',
    personalityTag: 'guard',
    tags: [],
    cost: 2,
    strength: 2,
    health: 3,
    rarity: 'common',
    abilities: ['taunt'],
  },
  runner: {
    id: 'runner',
    name: 'Гонец',
    personalityTag: 'runner',
    tags: [],
    cost: 1,
    strength: 1,
    health: 1,
    rarity: 'common',
    abilities: ['charge'],
  },
};

function deckOf(defId: string, n = 30): string[] {
  return Array.from({ length: n }, () => defId);
}

describe('createGame', () => {
  it('создаёт 60 карт (по 30 на игрока)', () => {
    const { state } = createGame({
      seed: 'test-1',
      decks: { p1: deckOf('guard'), p2: deckOf('runner') },
      cardDefinitions: defs,
    });
    expect(Object.keys(state.cards).length).toBe(60);
  });

  it('раздаёт по 4 карты, остальное — в колоде', () => {
    const { state } = createGame({
      seed: 'test-2',
      decks: { p1: deckOf('guard'), p2: deckOf('runner') },
      cardDefinitions: defs,
    });
    expect(state.players.p1.hand.length).toBe(4);
    expect(state.players.p1.deck.length).toBe(26);
    expect(state.players.p2.hand.length).toBe(4);
    expect(state.players.p2.deck.length).toBe(26);
  });

  it('стартовое Величие = 30 у обоих, Влияние у второго = 1', () => {
    const { state } = createGame({
      seed: 'test-3',
      decks: { p1: deckOf('guard'), p2: deckOf('runner') },
      cardDefinitions: defs,
    });
    expect(state.players.p1.glory).toBe(30);
    expect(state.players.p2.glory).toBe(30);
    const firstInfluence = state.players[state.activePlayer].influence;
    const secondInfluence = state.players[state.activePlayer === 'p1' ? 'p2' : 'p1'].influence;
    expect(firstInfluence).toBe(0);
    expect(secondInfluence).toBe(1);
  });

  it('детерминизм: одинаковый seed → одинаковый state', () => {
    const opts = {
      seed: 'deterministic-seed',
      decks: { p1: deckOf('guard'), p2: deckOf('runner') },
      cardDefinitions: defs,
    };
    const a = createGame(opts).state;
    const b = createGame(opts).state;
    expect(a.activePlayer).toBe(b.activePlayer);
    expect(a.players.p1.hand).toEqual(b.players.p1.hand);
    expect(a.players.p2.deck).toEqual(b.players.p2.deck);
  });

  it('разные seed → разные раздачи (проверяем, что не совпало)', () => {
    const a = createGame({
      seed: 'seed-A',
      decks: { p1: deckOf('guard'), p2: deckOf('runner') },
      cardDefinitions: defs,
    }).state;
    const b = createGame({
      seed: 'seed-B',
      decks: { p1: deckOf('guard'), p2: deckOf('runner') },
      cardDefinitions: defs,
    }).state;
    const sameP1Deck = JSON.stringify(a.players.p1.deck) === JSON.stringify(b.players.p1.deck);
    const sameP2Deck = JSON.stringify(a.players.p2.deck) === JSON.stringify(b.players.p2.deck);
    expect(sameP1Deck && sameP2Deck).toBe(false);
  });

  it('хелперы корректны на пустой доске', () => {
    const { state } = createGame({
      seed: 'helpers',
      decks: { p1: deckOf('guard'), p2: deckOf('runner') },
      cardDefinitions: defs,
    });
    expect(controlledCells(state, 'p1')).toBe(0);
    expect(frontCount(state, 'p1')).toBe(0);
    expect(findCardLocation(state, state.players.p1.hand[0])).toBeNull();
  });

  it('strength и health карты возвращают базовые значения без модификаторов', () => {
    const { state } = createGame({
      seed: 'stats',
      decks: { p1: deckOf('guard'), p2: deckOf('runner') },
      cardDefinitions: defs,
    });
    const card = state.cards[state.players.p1.hand[0]];
    expect(health(card)).toBe(3);
    expect(strength(card)).toBe(2);
  });
});

describe('Пакеты карт', () => {
  it('Stormwind проходит zod', () => {
    for (const def of STORMWIND_ASPECTS) {
      const r = CardDefinitionSchema.safeParse(def);
      if (!r.success) {
        throw new Error(`Stormwind ${def.id}: ${JSON.stringify(r.error.format())}`);
      }
    }
  });

  it('Voidflame проходит zod', () => {
    for (const def of VOIDFLAME_ASPECTS) {
      const r = CardDefinitionSchema.safeParse(def);
      if (!r.success) {
        throw new Error(`Voidflame ${def.id}: ${JSON.stringify(r.error.format())}`);
      }
    }
  });

  it('id уникальны во всех пакетах', () => {
    const all = [...STORMWIND_ASPECTS, ...VOIDFLAME_ASPECTS];
    const ids = new Set(all.map((c) => c.id));
    expect(ids.size).toBe(all.length);
  });

  it('в каждом пакете ≥30 карт', () => {
    expect(STORMWIND_ASPECTS.length).toBeGreaterThanOrEqual(30);
    expect(VOIDFLAME_ASPECTS.length).toBeGreaterThanOrEqual(30);
  });

  it.skip('есть пары с одинаковой personalityTag для теста замены', () => {
    function hasPair(defs: typeof STORMWIND_ASPECTS): boolean {
      const byTag = new Map<string, number>();
      for (const d of defs) {
        byTag.set(d.personalityTag, (byTag.get(d.personalityTag) ?? 0) + 1);
      }
      return [...byTag.values()].some((n) => n >= 2);
    }
    expect(hasPair(STORMWIND_ASPECTS)).toBe(true);
    expect(hasPair(VOIDFLAME_ASPECTS)).toBe(true);
  });
});

describe('Легендарные карты', () => {
  it('все легендарки уникальны и валидны', () => {
    const ids = new Set(LEGENDARY_ASPECTS.map((c) => c.id));
    expect(ids.size).toBe(LEGENDARY_ASPECTS.length); // нет дубликатов
    expect(LEGENDARY_ASPECTS.length).toBeGreaterThan(0);
    for (const c of LEGENDARY_ASPECTS) {
      expect(c.rarity).toBe('legendary');
    }
  });

  it('createGame запрещает >1 копии легендарки', () => {
    const legendId = LEGENDARY_ASPECTS[0].id;
    const deck = Array(30).fill(legendId);
    expect(() =>
      createGame({
        seed: 'legend-test',
        decks: { p1: deck, p2: deck },
        cardDefinitions: Object.fromEntries(ALL_CARDS.map((c) => [c.id, c])),
      }),
    ).toThrow(/legendary/);
  });
});