import { describe, it, expect } from 'vitest';
import { createGame } from '../state/create';
import { applyCommand } from '../commands/applyCommand';
import type { CardDefinition } from '@aspects/cards';
import type { GameState } from '../types/state';
import type { CardInstanceId, PlayerId } from '../types/ids';

const defs: Record<string, CardDefinition> = {
  discardingMage: {
    id: 'discardingMage', name: 'Маг-жертвователь', personalityTag: 'discardingMage', tags: [],
    cost: 2, strength: 2, health: 3, rarity: 'common',
    abilities: ['charge'],
    triggers: [],
    activatedAbilities: [{
      id: 'sacrifice_strike',
      cost: 1,
      discardCost: 1,
      effects: [
        { kind: 'DEAL_DAMAGE', amount: 3, target: 'ALL_ENEMY_FRONT' },
      ],
    }],
  } as any,

  plain: {
    id: 'plain', name: 'Пехотинец', personalityTag: 'plain', tags: [],
    cost: 1, strength: 0, health: 5, rarity: 'common',
    abilities: [],
    triggers: [], activatedAbilities: [],
  } as any,
};

const deck = [
  ...Array(10).fill('discardingMage'),
  ...Array(20).fill('plain'),
];

function setup(seed = 'activation'): GameState {
  let s = createGame({
    seed,
    decks: { p1: deck, p2: deck },
    cardDefinitions: defs,
  }).state;
  while (s.phase !== 'PLAY' && !s.pendingChoice) {
    s = applyCommand(s, { type: 'ADVANCE_PHASE', playerId: s.activePlayer }).state;
  }
  s = {
    ...s,
    players: {
      ...s.players,
      [s.activePlayer]: { ...s.players[s.activePlayer], influence: 10 },
    },
  };
  return s;
}

function ensureInHand(state: GameState, pid: PlayerId, defId: string): { state: GameState; cardId: CardInstanceId } {
  const player = state.players[pid];
  const existing = player.hand.find((id) => state.cards[id].definitionId === defId);
  if (existing) return { state, cardId: existing };
  const pool = [...player.hand, ...player.deck];
  const found = pool.find((id) => state.cards[id].definitionId === defId)!;
  if (!found) throw new Error(`No ${defId}`);
  const swap = player.hand[0];
  const newDeck = player.deck.map((id) => (id === found ? swap : id));
  const newHand = player.hand.map((id) => (id === swap ? found : id));
  return {
    state: {
      ...state,
      cards: {
        ...state.cards,
        [found]: { ...state.cards[found], zone: 'HAND' as const, column: null },
        [swap]: { ...state.cards[swap], zone: 'DECK' as const, column: null },
      },
      players: { ...state.players, [pid]: { ...player, deck: newDeck, hand: newHand } },
    },
    cardId: found,
  };
}

describe('discardCost на активируемой способности', () => {
  it('ставит pendingChoice ACTIVATION_DISCARD, инфлуенс пока не списан', () => {
    let s = setup();
    const active = s.activePlayer;
    const m = ensureInHand(s, active, 'discardingMage');
    s = m.state;
    s = applyCommand(s, {
      type: 'PLAY_CARD', playerId: active, cardId: m.cardId, column: 1,
    }).state;

    const infBefore = s.players[active].influence;
    const handBefore = s.players[active].hand.length;

    const r = applyCommand(s, {
      type: 'USE_ABILITY', playerId: active,
      cardId: m.cardId, abilityIndex: 0,
    });

    expect(r.state.pendingChoice).not.toBeNull();
    expect(r.state.pendingChoice!.kind).toBe('ACTIVATION_DISCARD');
    expect(r.state.players[active].influence).toBe(infBefore);
    expect(r.state.players[active].hand.length).toBe(handBefore);
  });

  it('RESOLVE_CHOICE списывает карты и инфлуенс, применяет эффект', () => {
    let s = setup();
    const active = s.activePlayer;
    const m = ensureInHand(s, active, 'discardingMage');
    s = m.state;
    s = applyCommand(s, {
      type: 'PLAY_CARD', playerId: active, cardId: m.cardId, column: 1,
    }).state;

    const infBefore = s.players[active].influence;
    const discardTarget = s.players[active].hand[0];

    s = applyCommand(s, {
      type: 'USE_ABILITY', playerId: active,
      cardId: m.cardId, abilityIndex: 0,
    }).state;

    const r = applyCommand(s, {
      type: 'RESOLVE_CHOICE', playerId: active,
      cardIds: [discardTarget],
    });

    expect(r.state.pendingChoice).toBeNull();
    expect(r.state.players[active].influence).toBe(infBefore - 1);
    expect(r.state.cards[discardTarget].zone).toBe('DISCARD');
    expect(r.state.cards[m.cardId].usedAbilitiesThisTurn).toContain(0);
  });

  it('CANCEL_CHOICE отменяет без траты', () => {
    let s = setup();
    const active = s.activePlayer;
    const m = ensureInHand(s, active, 'discardingMage');
    s = m.state;
    s = applyCommand(s, {
      type: 'PLAY_CARD', playerId: active, cardId: m.cardId, column: 1,
    }).state;

    const infBefore = s.players[active].influence;

    s = applyCommand(s, {
      type: 'USE_ABILITY', playerId: active,
      cardId: m.cardId, abilityIndex: 0,
    }).state;

    const r = applyCommand(s, {
      type: 'CANCEL_CHOICE', playerId: active,
    });

    expect(r.state.pendingChoice).toBeNull();
    expect(r.state.players[active].influence).toBe(infBefore);
    expect(r.state.cards[m.cardId].usedAbilitiesThisTurn).not.toContain(0);
    expect(r.events.some((e) => e.type === 'CHOICE_CANCELLED')).toBe(true);
  });

  it('недостаточно карт в руке → отклонение', () => {
    let s = setup();
    const active = s.activePlayer;
    const m = ensureInHand(s, active, 'discardingMage');
    s = m.state;
    s = applyCommand(s, {
      type: 'PLAY_CARD', playerId: active, cardId: m.cardId, column: 1,
    }).state;

    // Опустошаем руку
    const hand = [...s.players[active].hand];
    s = {
      ...s,
      players: {
        ...s.players,
        [active]: { ...s.players[active], hand: [], deck: [...s.players[active].deck, ...hand] },
      },
    };

    const r = applyCommand(s, {
      type: 'USE_ABILITY', playerId: active,
      cardId: m.cardId, abilityIndex: 0,
    });

    expect(r.events.some((e) => e.type === 'COMMAND_REJECTED' && (e as any).reason === 'not_enough_cards_to_discard')).toBe(true);
  });
});