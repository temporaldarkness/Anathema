import { describe, it, expect } from 'vitest';
import { createGame } from '../state/create';
import type { CardDefinition } from '@aspects/cards';
import type { PlayerId } from '../types/ids';

const defs: Record<string, CardDefinition> = {
  starter1: {
    id: 'starter1', name: 'Стартер A', personalityTag: 'starter1', tags: [],
    cost: 1, strength: 1, health: 1, rarity: 'common',
    abilities: ['starter'],
    triggers: [], activatedAbilities: [],
  } as any,
  starter2: {
    id: 'starter2', name: 'Стартер B', personalityTag: 'starter2', tags: [],
    cost: 1, strength: 1, health: 1, rarity: 'common',
    abilities: ['starter'],
    triggers: [], activatedAbilities: [],
  } as any,
  plain: {
    id: 'plain', name: 'Пехотинец', personalityTag: 'plain', tags: [],
    cost: 1, strength: 1, health: 1, rarity: 'common',
    abilities: [],
    triggers: [], activatedAbilities: [],
  } as any,
};

function makeDeck(counts: Record<string, number>): string[] {
  const deck: string[] = [];
  for (const [id, n] of Object.entries(counts)) {
    for (let i = 0; i < n; i++) deck.push(id);
  }
  if (deck.length !== 30) throw new Error(`Deck size ${deck.length}, expected 30`);
  return deck;
}

describe('starter', () => {
  it('одна стартовая карта гарантированно в руке', () => {
    const deck = makeDeck({ starter1: 3, plain: 27 });
    const s = createGame({
      seed: 'starter-test-1',
      decks: { p1: deck, p2: deck },
      cardDefinitions: defs,
    }).state;

    const p1Starters = s.players.p1.hand.filter((id) => {
      const c = s.cards[id];
      const def = s.definitions[c.definitionId];
      return (def.abilities ?? []).includes('starter');
    });
    const p2Starters = s.players.p2.hand.filter((id) => {
      const c = s.cards[id];
      const def = s.definitions[c.definitionId];
      return (def.abilities ?? []).includes('starter');
    });

    expect(p1Starters.length).toBe(1);
    expect(p2Starters.length).toBe(1);
  });

  it('колода без стартеров — обычная рука', () => {
    const deck = makeDeck({ plain: 30 });
    const s = createGame({
      seed: 'starter-test-2',
      decks: { p1: deck, p2: deck },
      cardDefinitions: defs,
    }).state;

    expect(s.players.p1.hand.length).toBe(4);
    const anyStarter = s.players.p1.hand.some((id) => {
      const c = s.cards[id];
      const def = s.definitions[c.definitionId];
      return (def.abilities ?? []).includes('starter');
    });
    expect(anyStarter).toBe(false);
  });

  it('детерминизм: одинаковый seed → одинаковый стартер', () => {
    const deck = makeDeck({ starter1: 5, starter2: 5, plain: 20 });
    const a = createGame({
      seed: 'starter-deterministic',
      decks: { p1: deck, p2: deck },
      cardDefinitions: defs,
    }).state;
    const b = createGame({
      seed: 'starter-deterministic',
      decks: { p1: deck, p2: deck },
      cardDefinitions: defs,
    }).state;

    const handA = a.players.p1.hand.join(',');
    const handB = b.players.p1.hand.join(',');
    expect(handA).toBe(handB);
  });

  it('несколько стартеров → один в руке, остальные в колоде', () => {
    const deck = makeDeck({ starter1: 3, plain: 27 });
    const s = createGame({
      seed: 'starter-multi',
      decks: { p1: deck, p2: deck },
      cardDefinitions: defs,
    }).state;

    const totalInHand = s.players.p1.hand.filter((id) => {
      const c = s.cards[id];
      const def = s.definitions[c.definitionId];
      return (def.abilities ?? []).includes('starter');
    }).length;
    const totalInDeck = s.players.p1.deck.filter((id) => {
      const c = s.cards[id];
      const def = s.definitions[c.definitionId];
      return (def.abilities ?? []).includes('starter');
    }).length;

    expect(totalInHand).toBe(1);
    expect(totalInDeck).toBe(2);
  });
});