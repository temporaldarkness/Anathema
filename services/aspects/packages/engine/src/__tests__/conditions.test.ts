import { describe, it, expect } from 'vitest';
import { createGame } from '../state/create';
import { applyCommand } from '../commands/applyCommand';
import { health, controlledCells } from '../state/helpers';
import type { CardDefinition } from '@aspects/cards';
import type { GameState } from '../types/state';
import type { ColumnIndex, PlayerId } from '../types/ids';
import { opponentOf } from '../types/ids';

const defs: Record<string, CardDefinition> = {
  stronghold: {
    id: 'stronghold', name: 'Твердыня', personalityTag: 'stronghold', tags: [],
    cost: 1, strength: 1, health: 1, rarity: 'common',
    abilities: ['charge'],
    triggers: [{
      trigger: 'ON_ENTER',
      condition: { kind: 'CELLS', who: 'SELF', op: 'AT_LEAST', value: 2 },
      effects: [{ kind: 'DEAL_DAMAGE', amount: 1, target: 'ALL_ENEMY_FRONT' }],
    }],
  },
  opportunist: {
    id: 'opportunist', name: 'Оппортунист', personalityTag: 'opportunist', tags: [],
    cost: 1, strength: 1, health: 1, rarity: 'common',
    abilities: ['charge'],
    triggers: [{
      trigger: 'ON_ENTER',
      condition: { kind: 'FRONT_COUNT', who: 'OPPONENT', op: 'AT_MOST', value: 1 },
      effects: [{ kind: 'DRAW', count: 1, who: 'SELF' }],
    }],
  },
  berserk: {
    id: 'berserk', name: 'Берсерк', personalityTag: 'berserk', tags: [],
    cost: 1, strength: 1, health: 3, rarity: 'common',
    abilities: ['charge'],
    triggers: [{
      trigger: 'ON_ENTER',
      condition: { kind: 'SELF_STRENGTH', op: 'AT_LEAST', value: 5 },
      effects: [{ kind: 'DRAW', count: 5, who: 'SELF' }],
    }],
  },
  pauper: {
    id: 'pauper', name: 'Бедняк', personalityTag: 'pauper', tags: [],
    cost: 1, strength: 1, health: 1, rarity: 'common',
    abilities: ['charge'],
    triggers: [{
      trigger: 'ON_ENTER',
      condition: { kind: 'INFLUENCE', who: 'SELF', op: 'EQUAL', value: 0 },
      effects: [{ kind: 'GAIN_INFLUENCE', amount: 1, who: 'SELF' }],
    }],
  },
  plain: {
    id: 'plain', name: 'Пехотинец', personalityTag: 'plain', tags: [],
    cost: 1, strength: 1, health: 5, rarity: 'common',
    abilities: [], triggers: [],
  },
};

const deck = [
  ...Array(5).fill('stronghold'),
  ...Array(5).fill('opportunist'),
  ...Array(5).fill('berserk'),
  ...Array(5).fill('pauper'),
  ...Array(10).fill('plain'),
];

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

function ensureInHand(state: GameState, pid: PlayerId, defId: string) {
  const player = state.players[pid];
  const existing = player.hand.find((id) => state.cards[id].definitionId === defId);
  if (existing) return { state, cardId: existing };
  const pool = [...player.hand, ...player.deck];
  const found = pool.find((id) => state.cards[id].definitionId === defId);
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
      players: {
        ...state.players,
        [pid]: { ...player, deck: newDeck, hand: newHand },
      },
    },
    cardId: found,
  };
}

function place(state: GameState, pid: PlayerId, defId: string, col: ColumnIndex, zone: 'FRONT' | 'RESERVE' = 'FRONT') {
  const pool = [...state.players[pid].hand, ...state.players[pid].deck];
  const cid = pool.find((id) => state.cards[id].definitionId === defId)!;
  const nb = state.board.map((c) => ({ ...c }));
  const targetCol = nb[col - 1];
  if (pid === 'p1') {
    if (zone === 'FRONT') targetCol.p1Front = cid;
    else targetCol.p1Reserve = cid;
  } else {
    if (zone === 'FRONT') targetCol.p2Front = cid;
    else targetCol.p2Reserve = cid;
  }
  return {
    state: {
      ...state,
      board: nb,
      cards: { ...state.cards, [cid]: { ...state.cards[cid], zone, column: col } },
      players: {
        ...state.players,
        [pid]: {
          ...state.players[pid],
          hand: state.players[pid].hand.filter((i) => i !== cid),
          deck: state.players[pid].deck.filter((i) => i !== cid),
        },
      },
    },
    cardId: cid,
  };
}

function setCell(state: GameState, col: ColumnIndex, owner: PlayerId | null): GameState {
  const nb = state.board.map((c) => ({ ...c }));
  nb[col - 1].neutralOwner = owner;
  return { ...state, board: nb };
}

describe('Условия триггеров', () => {
  it('CELLS AT_LEAST 2: не срабатывает без клеток', () => {
    let s = setup();
    const active = s.activePlayer;
    const opponent = opponentOf(active);

    const enemy = place(s, opponent, 'plain', 1);
    s = enemy.state;
    const before = health(s.cards[enemy.cardId]);

    const r = ensureInHand(s, active, 'stronghold');
    s = r.state;

    const result = applyCommand(s, {
      type: 'PLAY_CARD',
      playerId: active,
      cardId: r.cardId,
      column: 3,
    });

    expect(health(result.state.cards[enemy.cardId])).toBe(before);
  });

  it('CELLS AT_LEAST 2: срабатывает при 2+ клетках', () => {
    let s = setup();
    const active = s.activePlayer;
    const opponent = opponentOf(active);

    s = setCell(s, 1, active);
    s = setCell(s, 2, active);
    expect(controlledCells(s, active)).toBe(2);

    const enemy = place(s, opponent, 'plain', 1);
    s = enemy.state;
    const before = health(s.cards[enemy.cardId]);

    const r = ensureInHand(s, active, 'stronghold');
    s = r.state;

    const result = applyCommand(s, {
      type: 'PLAY_CARD',
      playerId: active,
      cardId: r.cardId,
      column: 3,
    });

    expect(health(result.state.cards[enemy.cardId])).toBe(before - 1);
  });

  it('FRONT_COUNT OPPONENT AT_MOST 1: срабатывает при пустом фронте врага', () => {
    let s = setup();
    const active = s.activePlayer;

    const r = ensureInHand(s, active, 'opportunist');
    s = r.state;
    const handBefore = s.players[active].hand.length;

    const result = applyCommand(s, {
      type: 'PLAY_CARD',
      playerId: active,
      cardId: r.cardId,
      column: 1,
    });

    expect(result.state.players[active].hand.length).toBe(handBefore);
  });

  it('FRONT_COUNT OPPONENT AT_MOST 1: не срабатывает, если у врага 2+ карты', () => {
    let s = setup();
    const active = s.activePlayer;
    const opponent = opponentOf(active);

    const e1 = place(s, opponent, 'plain', 1);
    s = e1.state;
    const e2 = place(s, opponent, 'plain', 2);
    s = e2.state;

    const r = ensureInHand(s, active, 'opportunist');
    s = r.state;
    const handBefore = s.players[active].hand.length;

    const result = applyCommand(s, {
      type: 'PLAY_CARD',
      playerId: active,
      cardId: r.cardId,
      column: 3,
    });

    expect(result.state.players[active].hand.length).toBe(handBefore - 1);
  });

  it('SELF_STRENGTH AT_LEAST 5: не срабатывает при силе 1', () => {
    let s = setup();
    const active = s.activePlayer;

    const r = ensureInHand(s, active, 'berserk');
    s = r.state;
    const handBefore = s.players[active].hand.length;

    const result = applyCommand(s, {
      type: 'PLAY_CARD',
      playerId: active,
      cardId: r.cardId,
      column: 1,
    });

    expect(result.state.players[active].hand.length).toBe(handBefore - 1);
  });

  it('INFLUENCE EQUAL 0: срабатывает при нуле влияния', () => {
    let s = setup();
    const active = s.activePlayer;

    s = {
      ...s,
      players: {
        ...s.players,
        [active]: { ...s.players[active], influence: 0 },
      },
    };

    const r = ensureInHand(s, active, 'pauper');
    s = r.state;

    const result = applyCommand(s, {
      type: 'PLAY_CARD',
      playerId: active,
      cardId: r.cardId,
      column: 1,
    });

    expect(
      result.events.some((e) => e.type === 'COMMAND_REJECTED' && e.reason === 'not_enough_influence'),
    ).toBe(true);
  });

  it('INFLUENCE EQUAL 0: срабатывает после оплаты', () => {
    let s = setup();
    const active = s.activePlayer;

    s = {
      ...s,
      players: {
        ...s.players,
        [active]: { ...s.players[active], influence: 1 },
      },
    };

    const r = ensureInHand(s, active, 'pauper');
    s = r.state;

    const result = applyCommand(s, {
      type: 'PLAY_CARD',
      playerId: active,
      cardId: r.cardId,
      column: 1,
    });

    expect(result.state.players[active].influence).toBe(1);
  });
});