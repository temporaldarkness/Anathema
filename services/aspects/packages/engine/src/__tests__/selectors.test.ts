import { describe, it, expect } from 'vitest';
import { createGame } from '../state/create';
import { applyCommand } from '../commands/applyCommand';
import { health } from '../state/helpers';
import type { CardDefinition } from '@aspects/cards';
import type { GameState } from '../types/state';
import type { ColumnIndex, PlayerId } from '../types/ids';
import { opponentOf } from '../types/ids';

const defs: Record<string, CardDefinition> = {
  nuke: {
    id: 'nuke', name: 'Ядро', personalityTag: 'nuke', tags: [],
    cost: 1, strength: 1, health: 1, rarity: 'common',
    abilities: ['charge'],
    triggers: [{
      trigger: 'ON_ENTER',
      effects: [{ kind: 'DEAL_DAMAGE', amount: 1, target: 'ALL_CARDS_ON_BOARD' }],
    }],
  },
  bomber: {
    id: 'bomber', name: 'Бомбардир', personalityTag: 'bomber', tags: [],
    cost: 1, strength: 1, health: 1, rarity: 'common',
    abilities: ['charge'],
    triggers: [{
      trigger: 'ON_ENTER',
      effects: [{ kind: 'DEAL_DAMAGE', amount: 1, target: 'ALL_ENEMY_BOARD' }],
    }],
  },
  sniper: {
    id: 'sniper', name: 'Снайпер', personalityTag: 'sniper', tags: [],
    cost: 1, strength: 1, health: 1, rarity: 'common',
    abilities: ['charge'],
    triggers: [{
      trigger: 'ON_ENTER',
      effects: [{ kind: 'DEAL_DAMAGE', amount: 1, target: 'RANDOM_ENEMY_FRONT' }],
    }],
  },
  plain: {
    id: 'plain', name: 'Пехотинец', personalityTag: 'plain', tags: [],
    cost: 1, strength: 3, health: 3, rarity: 'common',
    abilities: [], triggers: [],
  },
};

const deck = [
  ...Array(10).fill('nuke'),
  ...Array(5).fill('bomber'),
  ...Array(5).fill('sniper'),
  ...Array(10).fill('plain'),
];

function setup(seed = 'selectors'): GameState {
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

function place(state: GameState, pid: PlayerId, defId: string, col: ColumnIndex, zone: 'FRONT' | 'RESERVE' = 'FRONT') {
  const pool = [...state.players[pid].hand, ...state.players[pid].deck];
  const cid = pool.find((id) => state.cards[id].definitionId === defId)!;
  if (!cid) throw new Error(`No ${defId}`);
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

describe('Селекторы', () => {
  it('ALL_CARDS_ON_BOARD бьёт всех, кроме источника', () => {
    let s = setup();
    const active = s.activePlayer;
    const opponent = opponentOf(active);

    const a1 = place(s, active, 'plain', 1);
    s = a1.state;
    const b1 = place(s, opponent, 'plain', 1);
    s = b1.state;
    const b2 = place(s, opponent, 'plain', 2);
    s = b2.state;

    const r = ensureInHand(s, active, 'nuke');
    s = r.state;

    const beforeA1 = health(s.cards[a1.cardId]);
    const beforeB1 = health(s.cards[b1.cardId]);
    const beforeB2 = health(s.cards[b2.cardId]);

    const playResult = applyCommand(s, {
      type: 'PLAY_CARD',
      playerId: active,
      cardId: r.cardId,
      column: 3,
    });

    expect(playResult.events.some((e) => e.type === 'COMMAND_REJECTED')).toBe(false);
    expect(health(playResult.state.cards[a1.cardId])).toBe(beforeA1 - 1);
    expect(health(playResult.state.cards[b1.cardId])).toBe(beforeB1 - 1);
    expect(health(playResult.state.cards[b2.cardId])).toBe(beforeB2 - 1);
  });

  it('ALL_ENEMY_BOARD бьёт и Фронт, и Резерв', () => {
    let s = setup();
    const active = s.activePlayer;
    const opponent = opponentOf(active);

    const b1 = place(s, opponent, 'plain', 1, 'FRONT');
    s = b1.state;
    const b2 = place(s, opponent, 'plain', 2, 'RESERVE');
    s = b2.state;

    const r = ensureInHand(s, active, 'bomber');
    s = r.state;

    const beforeFront = health(s.cards[b1.cardId]);
    const beforeRes = health(s.cards[b2.cardId]);

    const playResult = applyCommand(s, {
      type: 'PLAY_CARD',
      playerId: active,
      cardId: r.cardId,
      column: 3,
    });

    expect(health(playResult.state.cards[b1.cardId])).toBe(beforeFront - 1);
    expect(health(playResult.state.cards[b2.cardId])).toBe(beforeRes - 1);
  });

  it('RANDOM_ENEMY_FRONT выбирает одну карту (детерминированно)', () => {
    let s = setup('rng-seed-1');
    const active = s.activePlayer;
    const opponent = opponentOf(active);

    const b1 = place(s, opponent, 'plain', 1, 'FRONT');
    s = b1.state;
    const b2 = place(s, opponent, 'plain', 2, 'FRONT');
    s = b2.state;

    const r = ensureInHand(s, active, 'sniper');
    s = r.state;

    const before1 = health(s.cards[b1.cardId]);
    const before2 = health(s.cards[b2.cardId]);

    const playResult = applyCommand(s, {
      type: 'PLAY_CARD',
      playerId: active,
      cardId: r.cardId,
      column: 3,
    });

    const after1 = health(playResult.state.cards[b1.cardId]);
    const after2 = health(playResult.state.cards[b2.cardId]);
    const damage = (before1 - after1) + (before2 - after2);
    expect(damage).toBe(1);
  });

  it('RANDOM_ENEMY_FRONT детерминирован по seed', () => {
    function runOnce(seed: string): string {
      let s = setup(seed);
      const active = s.activePlayer;
      const opponent = opponentOf(active);

      const b1 = place(s, opponent, 'plain', 1, 'FRONT');
      s = b1.state;
      const b2 = place(s, opponent, 'plain', 2, 'FRONT');
      s = b2.state;

      const r = ensureInHand(s, active, 'sniper');
      s = r.state;

      const playResult = applyCommand(s, {
        type: 'PLAY_CARD',
        playerId: active,
        cardId: r.cardId,
        column: 3,
      });
      return health(playResult.state.cards[b1.cardId]) < 3 ? 'b1' : 'b2';
    }

    expect(runOnce('same-seed')).toBe(runOnce('same-seed'));
  });

  it('RANDOM_ENEMY_FRONT не срабатывает, если враг пуст', () => {
    let s = setup();
    const active = s.activePlayer;

    const r = ensureInHand(s, active, 'sniper');
    s = r.state;

    const playResult = applyCommand(s, {
      type: 'PLAY_CARD',
      playerId: active,
      cardId: r.cardId,
      column: 3,
    });

    expect(playResult.events.some((e) => e.type === 'COMMAND_REJECTED')).toBe(false);
  });
});