import { describe, it, expect } from 'vitest';
import { createGame } from '../state/create';
import { applyCommand } from '../commands/applyCommand';
import type { CardDefinition } from '@aspects/cards';
import type { GameState } from '../types/state';
import type { CardInstanceId, ColumnIndex, PlayerId } from '../types/ids';

const defs: Record<string, CardDefinition> = {
  reserveBooster: {
    id: 'reserveBooster', name: 'Резервный', personalityTag: 'reserveBooster', tags: [],
    cost: 1, strength: 1, health: 3, rarity: 'common',
    abilities: [],
    triggers: [{
      trigger: 'ON_ENTER',
      condition: { kind: 'IN_RESERVE' },
      effects: [{ kind: 'BUFF', strength: 1, health: 1, target: 'SELF' }],
    }],
    activatedAbilities: [],
  } as any,

  chargeBooster: {
    id: 'chargeBooster', name: 'Рывковый', personalityTag: 'chargeBooster', tags: [],
    cost: 1, strength: 1, health: 3, rarity: 'common',
    abilities: ['charge'],
    triggers: [{
      trigger: 'ON_ENTER',
      condition: { kind: 'IN_FRONT' },
      effects: [{ kind: 'BUFF', strength: 1, health: 1, target: 'SELF' }],
    }],
    activatedAbilities: [],
  } as any,

  andConditional: {
    id: 'andConditional', name: 'И-условный', personalityTag: 'andConditional', tags: [],
    cost: 1, strength: 1, health: 3, rarity: 'common',
    abilities: [],
    triggers: [{
      trigger: 'ON_ENTER',
      condition: {
        kind: 'AND',
        conditions: [
          { kind: 'GLORY', who: 'SELF', op: 'AT_LEAST', value: 25 },
          { kind: 'INFLUENCE', who: 'SELF', op: 'AT_LEAST', value: 5 },
        ],
      },
      effects: [{ kind: 'BUFF', strength: 1, health: 1, target: 'SELF' }],
    }],
    activatedAbilities: [],
  } as any,

  orConditional: {
    id: 'orConditional', name: 'ИЛИ-условный', personalityTag: 'orConditional', tags: [],
    cost: 1, strength: 1, health: 3, rarity: 'common',
    abilities: [],
    triggers: [{
      trigger: 'ON_ENTER',
      condition: {
        kind: 'OR',
        conditions: [
          { kind: 'GLORY', who: 'SELF', op: 'AT_MOST', value: 5 },
          { kind: 'INFLUENCE', who: 'SELF', op: 'AT_LEAST', value: 8 },
        ],
      },
      effects: [{ kind: 'BUFF', strength: 1, health: 1, target: 'SELF' }],
    }],
    activatedAbilities: [],
  } as any,

  notConditional: {
    id: 'notConditional', name: 'НЕ-условный', personalityTag: 'notConditional', tags: [],
    cost: 1, strength: 1, health: 3, rarity: 'common',
    abilities: [],
    triggers: [{
      trigger: 'ON_ENTER',
      condition: {
        kind: 'NOT',
        condition: { kind: 'GLORY', who: 'SELF', op: 'AT_MOST', value: 5 },
      },
      effects: [{ kind: 'BUFF', strength: 1, health: 1, target: 'SELF' }],
    }],
    activatedAbilities: [],
  } as any,

  plain: {
    id: 'plain', name: 'Пехотинец', personalityTag: 'plain', tags: [],
    cost: 1, strength: 0, health: 5, rarity: 'common',
    abilities: [],
    triggers: [], activatedAbilities: [],
  } as any,

  totalStrengthWatcher: {
    id: 'totalStrengthWatcher', name: 'Счётчик силы', personalityTag: 'totalStrengthWatcher', tags: [],
    cost: 1, strength: 5, health: 5, rarity: 'common',
    abilities: ['charge'],
    triggers: [{
      trigger: 'ON_ENTER',
      condition: { kind: 'TOTAL_STRENGTH', who: 'SELF', op: 'AT_LEAST', value: 5 },
      effects: [{ kind: 'BUFF', strength: 1, health: 1, target: 'SELF' }],
    }],
    activatedAbilities: [],
  } as any,
};

const deck = [
  ...Array(4).fill('reserveBooster'),
  ...Array(4).fill('chargeBooster'),
  ...Array(4).fill('andConditional'),
  ...Array(4).fill('orConditional'),
  ...Array(4).fill('notConditional'),
  ...Array(5).fill('plain'),
  ...Array(5).fill('totalStrengthWatcher'),
]; // 4+4+4+4+4+5+5 = 30

function setup(seed = 'conditions'): GameState {
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

function placeCard(state: GameState, playerId: PlayerId, defId: string, column: ColumnIndex) {
  const player = state.players[playerId];
  const pool = [...player.hand, ...player.deck];
  const cardId = pool.find((id) => state.cards[id].definitionId === defId)!;
  if (!cardId) throw new Error(`No ${defId}`);
  const newHand = player.hand.filter((id) => id !== cardId);
  const newDeck = player.deck.filter((id) => id !== cardId);
  const newBoard = state.board.map((c) => ({ ...c }));
  const col = newBoard[column - 1];
  if (playerId === 'p1') col.p1Front = cardId;
  else col.p2Front = cardId;
  return {
    state: {
      ...state,
      board: newBoard,
      cards: { ...state.cards, [cardId]: { ...state.cards[cardId], zone: 'FRONT' as const, column } },
      players: { ...state.players, [playerId]: { ...player, hand: newHand, deck: newDeck } },
    },
    cardId,
  };
}

describe('IN_RESERVE / IN_FRONT', () => {
  it('IN_RESERVE срабатывает при разыгрыше без charge', () => {
    let s = setup();
    const active = s.activePlayer;
    const r = ensureInHand(s, active, 'reserveBooster');
    s = r.state;

    s = applyCommand(s, {
      type: 'PLAY_CARD', playerId: active,
      cardId: r.cardId, column: 1,
    }).state;

    const card = s.cards[r.cardId];
    const strMods = card.modifiers.filter((m) => m.stat === 'strength').reduce((a, m) => a + m.delta, 0);
    expect(strMods).toBe(1);
  });

  it('IN_FRONT срабатывает при разыгрыше с charge', () => {
    let s = setup();
    const active = s.activePlayer;
    const r = ensureInHand(s, active, 'chargeBooster');
    s = r.state;

    s = applyCommand(s, {
      type: 'PLAY_CARD', playerId: active,
      cardId: r.cardId, column: 1,
    }).state;

    const card = s.cards[r.cardId];
    expect(card.zone).toBe('FRONT');
    const strMods = card.modifiers.filter((m) => m.stat === 'strength').reduce((a, m) => a + m.delta, 0);
    expect(strMods).toBe(1);
  });
});

describe('AND / OR / NOT', () => {
  it('AND: оба условия выполнены → срабатывает', () => {
    let s = setup();
    const active = s.activePlayer;
    const r = ensureInHand(s, active, 'andConditional');
    s = r.state;
    s = applyCommand(s, { type: 'PLAY_CARD', playerId: active, cardId: r.cardId, column: 1 }).state;
    const card = s.cards[r.cardId];
    const strMods = card.modifiers.filter((m) => m.stat === 'strength').reduce((a, m) => a + m.delta, 0);
    expect(strMods).toBe(1);
  });

  it('AND: одно условие не выполнено → не срабатывает', () => {
    let s = setup();
    const active = s.activePlayer;
    s = {
      ...s,
      players: { ...s.players, [active]: { ...s.players[active], influence: 3 } },
    };
    const r = ensureInHand(s, active, 'andConditional');
    s = r.state;
    s = applyCommand(s, { type: 'PLAY_CARD', playerId: active, cardId: r.cardId, column: 1 }).state;
    const card = s.cards[r.cardId];
    expect(card.modifiers.length).toBe(0);
  });

  it('OR: хотя бы одно выполнено → срабатывает', () => {
    let s = setup();
    const active = s.activePlayer;
    const r = ensureInHand(s, active, 'orConditional');
    s = r.state;
    s = applyCommand(s, { type: 'PLAY_CARD', playerId: active, cardId: r.cardId, column: 1 }).state;
    const card = s.cards[r.cardId];
    const strMods = card.modifiers.filter((m) => m.stat === 'strength').reduce((a, m) => a + m.delta, 0);
    expect(strMods).toBe(1);
  });

  it('OR: ни одно не выполнено → не срабатывает', () => {
    let s = setup();
    const active = s.activePlayer;
    s = {
      ...s,
      players: { ...s.players, [active]: { ...s.players[active], influence: 5 } },
    };
    const r = ensureInHand(s, active, 'orConditional');
    s = r.state;
    s = applyCommand(s, { type: 'PLAY_CARD', playerId: active, cardId: r.cardId, column: 1 }).state;
    const card = s.cards[r.cardId];
    expect(card.modifiers.length).toBe(0);
  });

  it('NOT инвертирует условие', () => {
    let s = setup();
    const active = s.activePlayer;
    const r = ensureInHand(s, active, 'notConditional');
    s = r.state;
    s = applyCommand(s, { type: 'PLAY_CARD', playerId: active, cardId: r.cardId, column: 1 }).state;
    const card = s.cards[r.cardId];
    const strMods = card.modifiers.filter((m) => m.stat === 'strength').reduce((a, m) => a + m.delta, 0);
    expect(strMods).toBe(1);
  });
});

describe('TOTAL_STRENGTH', () => {
  it('считает сумму силы на Фронте владельца', () => {
    let s = setup();
    const active = s.activePlayer;

    const r = ensureInHand(s, active, 'totalStrengthWatcher');
    s = r.state;
    s = applyCommand(s, {
      type: 'PLAY_CARD', playerId: active,
      cardId: r.cardId, column: 1,
    }).state;

    // При ON_ENTER карта уже во Фронте (charge). Её собственная сила 5,
    // условие AT_LEAST 5 → сработало → +1/+1.
    const card = s.cards[r.cardId];
    const strMods = card.modifiers.filter((m) => m.stat === 'strength').reduce((a, m) => a + m.delta, 0);
    expect(strMods).toBe(1);
  });
});