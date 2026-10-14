import { describe, it, expect } from 'vitest';
import { createGame } from '../state/create';
import { applyCommand } from '../commands/applyCommand';
import { health, strength } from '../state/helpers';
import type { CardDefinition } from '@aspects/cards';
import type { GameState } from '../types/state';
import type { ColumnIndex, PlayerId } from '../types/ids';
import { opponentOf } from '../types/ids';

const defs: Record<string, CardDefinition> = {
  suppressor: {
    id: 'suppressor', name: 'Подавитель', personalityTag: 'suppressor', tags: [],
    cost: 2, strength: 3, health: 4, rarity: 'common',
    abilities: ['suppress'], triggers: [],
  },
  plain: {
    id: 'plain', name: 'Пехотинец', personalityTag: 'plain', tags: [],
    cost: 1, strength: 3, health: 3, rarity: 'common',
    abilities: [], triggers: [],
  },
};

const deck = [...Array(15).fill('suppressor'), ...Array(15).fill('plain')];

function setup(): GameState {
  let s = createGame({
    seed: 'suppress',
    decks: { p1: deck, p2: deck },
    cardDefinitions: defs,
  }).state;
  while (s.phase !== 'PLAY' && !s.pendingChoice) {
    s = applyCommand(s, { type: 'ADVANCE_PHASE', playerId: s.activePlayer }).state;
  }
  return s;
}

function place(state: GameState, pid: PlayerId, defId: string, col: ColumnIndex) {
  const pool = [...state.players[pid].hand, ...state.players[pid].deck];
  const cid = pool.find((id) => state.cards[id].definitionId === defId)!;
  const nb = state.board.map((c) => ({ ...c }));
  const targetCol = nb[col - 1];
  if (pid === 'p1') targetCol.p1Front = cid;
  else targetCol.p2Front = cid;
  return {
    state: {
      ...state,
      board: nb,
      cards: { ...state.cards, [cid]: { ...state.cards[cid], zone: 'FRONT' as const, column: col } },
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

describe('Подавление', () => {
  it('снижает силу и здоровье карты напротив на 1', () => {
    let s = setup();
    const active = s.activePlayer;
    const opponent = opponentOf(active);

    const sup = place(s, active, 'suppressor', 1);
    s = sup.state;
    const victim = place(s, opponent, 'plain', 1);
    s = victim.state;

    s = applyCommand(s, { type: 'ADVANCE_PHASE', playerId: s.activePlayer }).state;

    expect(strength(s.cards[victim.cardId])).toBe(2);
    expect(health(s.cards[victim.cardId])).toBe(2);
  });

  it('не влияет, если колонки не совпадают', () => {
    let s = setup();
    const active = s.activePlayer;
    const opponent = opponentOf(active);

    const sup = place(s, active, 'suppressor', 1);
    s = sup.state;
    const victim = place(s, opponent, 'plain', 2);
    s = victim.state;

    s = applyCommand(s, { type: 'ADVANCE_PHASE', playerId: s.activePlayer }).state;

    expect(strength(s.cards[victim.cardId])).toBe(3);
    expect(health(s.cards[victim.cardId])).toBe(3);
  });

  it('два супрессора друг напротив друга — взаимное подавление', () => {
    let s = setup();
    const active = s.activePlayer;
    const opponent = opponentOf(active);

    const a = place(s, active, 'suppressor', 1);
    s = a.state;
    const b = place(s, opponent, 'suppressor', 1);
    s = b.state;

    s = applyCommand(s, { type: 'ADVANCE_PHASE', playerId: s.activePlayer }).state;

    expect(strength(s.cards[a.cardId])).toBe(2);
    expect(health(s.cards[a.cardId])).toBe(3);
    expect(strength(s.cards[b.cardId])).toBe(2);
    expect(health(s.cards[b.cardId])).toBe(3);
  });

  it('подавление снимается, когда супрессор уходит с поля', () => {
    let s = setup();
    const active = s.activePlayer;
    const opponent = opponentOf(active);

    const sup = place(s, active, 'suppressor', 1);
    s = sup.state;
    const victim = place(s, opponent, 'plain', 1);
    s = victim.state;

    s = applyCommand(s, { type: 'ADVANCE_PHASE', playerId: s.activePlayer }).state;
    expect(strength(s.cards[victim.cardId])).toBe(2);

    const nb = s.board.map((c) => ({ ...c }));
    nb[0].p1Front = null;
    s = {
      ...s,
      board: nb,
      cards: {
        ...s.cards,
        [sup.cardId]: { ...s.cards[sup.cardId], zone: 'DISCARD', column: null },
      },
    };

    s = applyCommand(s, { type: 'ADVANCE_PHASE', playerId: s.activePlayer }).state;
    expect(strength(s.cards[victim.cardId])).toBe(3);
    expect(health(s.cards[victim.cardId])).toBe(3);
  });
});