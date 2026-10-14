import { describe, it, expect } from 'vitest';
import { createGame } from '../state/create';
import { applyCommand } from '../commands/applyCommand';
import { health } from '../state/helpers';
import type { CardDefinition } from '@aspects/cards';
import type { GameState } from '../types/state';
import type { ColumnIndex, PlayerId } from '../types/ids';
import { opponentOf } from '../types/ids';

const defs: Record<string, CardDefinition> = {
  plain: {
    id: 'plain', name: 'Простой', personalityTag: 'plain', tags: [],
    cost: 1, strength: 3, health: 3, rarity: 'common',
    abilities: ['charge'], triggers: [], activatedAbilities: [],
  } as any,
  plain2: {
    id: 'plain2', name: 'Простой 2', personalityTag: 'plain2', tags: [],
    cost: 1, strength: 1, health: 1, rarity: 'common',
    abilities: ['charge'], triggers: [], activatedAbilities: [],
  } as any,
};

const deck = [
  ...Array(15).fill('plain'),
  ...Array(15).fill('plain2'),
];

function setup(seed = 'reset-test'): GameState {
  let s = createGame({
    seed,
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
  const tc = nb[col - 1];
  if (pid === 'p1') tc.p1Front = cid; else tc.p2Front = cid;
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

describe('Сброс рантайм-состояния карт', () => {
  it('карта после смерти и возврата из сброса не наследует старый урон', () => {
    let s = setup();
    const active = s.activePlayer;
    const opp = opponentOf(active);

    // Разыгрываем простого (3/3, charge) — сразу во Фронт.
    const pool = [...s.players[active].hand, ...s.players[active].deck];
    const victimId = pool.find((id) => s.cards[id].definitionId === 'plain')!;
    s = {
      ...s,
      cards: { ...s.cards, [victimId]: { ...s.cards[victimId], zone: 'FRONT' as const, column: 1 } },
      board: s.board.map((c, i) => i === 0 ? { ...c, p1Front: victimId } : c),
      players: {
        ...s.players,
        [active]: {
          ...s.players[active],
          hand: s.players[active].hand.filter((i) => i !== victimId),
          deck: s.players[active].deck.filter((i) => i !== victimId),
        },
      },
    };

    // Наносим урон 5 вручную и убиваем.
    s = {
      ...s,
      cards: {
        ...s.cards,
        [victimId]: { ...s.cards[victimId], damageTaken: 5 },
      },
    };
    expect(health(s.cards[victimId])).toBe(-2);

    // Убиваем через любую команду (drain вызовет killCard).
    s = applyCommand(s, { type: 'ADVANCE_PHASE', playerId: s.activePlayer }).state;
    expect(s.cards[victimId].zone).toBe('DISCARD');
    // damageTaken должен быть 0 — карта в сбросе «как новая».
    expect(s.cards[victimId].damageTaken).toBe(0);
    expect(health(s.cards[victimId])).toBe(3);
  });

  it('карта из руки разыгрывается с полным здоровьем, даже если раньше была ранена', () => {
    let s = setup();
    const active = s.activePlayer;

    // Берём карту в руке, искусственно портим ей damageTaken.
    const cardId = s.players[active].hand[0];
    s = {
      ...s,
      cards: { ...s.cards, [cardId]: { ...s.cards[cardId], damageTaken: 5 } },
      players: {
        ...s.players,
        [active]: { ...s.players[active], influence: 10 },
      },
    };

    // Разыгрываем.
    const r = applyCommand(s, {
      type: 'PLAY_CARD',
      playerId: active,
      cardId,
      column: 1,
    });

    expect(r.events.some((e) => e.type === 'COMMAND_REJECTED')).toBe(false);
    // После розыгрыша damageTaken = 0 (сброшено), hp полное.
    expect(r.state.cards[cardId].damageTaken).toBe(0);
    expect(health(r.state.cards[cardId])).toBe(r.state.cards[cardId].baseHealth);
  });
});