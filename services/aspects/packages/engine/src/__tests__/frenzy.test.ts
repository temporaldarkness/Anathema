import { describe, it, expect } from 'vitest';
import { createGame } from '../state/create';
import { applyCommand } from '../commands/applyCommand';
import { health } from '../state/helpers';
import type { CardDefinition } from '@aspects/cards';
import type { GameState } from '../types/state';
import type { CardInstanceId, ColumnIndex, PlayerId } from '../types/ids';
import { opponentOf } from '../types/ids';

const defs: Record<string, CardDefinition> = {
  frenzyAttacker: {
    id: 'frenzyAttacker', name: 'Яростный берсерк', personalityTag: 'frenzyAttacker', tags: [],
    cost: 3, strength: 3, health: 4, rarity: 'common',
    abilities: ['frenzy'], triggers: [], activatedAbilities: [],
  } as any,
  plainAttacker: {
    id: 'plainAttacker', name: 'Обычный воин', personalityTag: 'plainAttacker', tags: [],
    cost: 3, strength: 3, health: 4, rarity: 'common',
    abilities: [], triggers: [], activatedAbilities: [],
  } as any,
  dummy: {
    id: 'dummy', name: 'Болван', personalityTag: 'dummy', tags: [],
    cost: 1, strength: 0, health: 10, rarity: 'common',
    abilities: [], triggers: [], activatedAbilities: [],
  } as any,
};

const deck = [
  ...Array(10).fill('frenzyAttacker'),
  ...Array(10).fill('plainAttacker'),
  ...Array(10).fill('dummy'),
];

function setup(seed = 'frenzy'): GameState {
  let s = createGame({ seed, decks: { p1: deck, p2: deck }, cardDefinitions: defs }).state;
  while (s.phase !== 'PLAY' && !s.pendingChoice) {
    s = applyCommand(s, { type: 'ADVANCE_PHASE', playerId: s.activePlayer }).state;
  }
  return s;
}

function placeCard(
  state: GameState,
  playerId: PlayerId,
  defId: string,
  column: ColumnIndex,
): { state: GameState; cardId: CardInstanceId } {
  const pool = [...state.players[playerId].hand, ...state.players[playerId].deck];
  const cardId = pool.find((id) => state.cards[id].definitionId === defId);
  if (!cardId) throw new Error(`No ${defId} for ${playerId}`);
  const nb = state.board.map((c) => ({ ...c }));
  const col = nb[column - 1];
  if (playerId === 'p1') col.p1Front = cardId;
  else col.p2Front = cardId;
  return {
    state: {
      ...state,
      board: nb,
      cards: {
        ...state.cards,
        [cardId]: { ...state.cards[cardId], zone: 'FRONT' as const, column, exhausted: false },
      },
      players: {
        ...state.players,
        [playerId]: {
          ...state.players[playerId],
          hand: state.players[playerId].hand.filter((i) => i !== cardId),
          deck: state.players[playerId].deck.filter((i) => i !== cardId),
        },
      },
    },
    cardId,
  };
}

function advanceToCombat(state: GameState): GameState {
  let s = state;
  while (s.phase !== 'COMBAT' && !s.pendingChoice && !s.winner) {
    s = applyCommand(s, { type: 'ADVANCE_PHASE', playerId: s.activePlayer }).state;
  }
  return s;
}

describe('frenzy', () => {
  it('карта с frenzy может атаковать дважды за ход', () => {
    let s = setup();
    const active = s.activePlayer;
    const opp = opponentOf(active);

    const target = placeCard(s, opp, 'dummy', 1);
    s = target.state;
    const attacker = placeCard(s, active, 'frenzyAttacker', 1);
    s = attacker.state;

    s = advanceToCombat(s);

    const first = applyCommand(s, {
      type: 'ATTACK', playerId: active,
      attackerId: attacker.cardId,
      target: { kind: 'CARD', cardId: target.cardId },
    });
    expect(first.events.some((e) => e.type === 'COMMAND_REJECTED')).toBe(false);
    s = first.state;

    const second = applyCommand(s, {
      type: 'ATTACK', playerId: active,
      attackerId: attacker.cardId,
      target: { kind: 'CARD', cardId: target.cardId },
    });
    expect(second.events.some((e) => e.type === 'COMMAND_REJECTED')).toBe(false);

    expect(health(second.state.cards[target.cardId])).toBe(4);
  });

  it('после первой атаки не истощается', () => {
    let s = setup();
    const active = s.activePlayer;
    const opp = opponentOf(active);

    const target = placeCard(s, opp, 'dummy', 1);
    s = target.state;
    const attacker = placeCard(s, active, 'frenzyAttacker', 1);
    s = attacker.state;

    s = advanceToCombat(s);
    s = applyCommand(s, {
      type: 'ATTACK', playerId: active,
      attackerId: attacker.cardId,
      target: { kind: 'CARD', cardId: target.cardId },
    }).state;

    expect(s.cards[attacker.cardId].attacksThisTurn).toBe(1);
    expect(s.cards[attacker.cardId].exhausted).toBe(false);
  });

  it('после второй атаки истощается', () => {
    let s = setup();
    const active = s.activePlayer;
    const opp = opponentOf(active);

    const target = placeCard(s, opp, 'dummy', 1);
    s = target.state;
    const attacker = placeCard(s, active, 'frenzyAttacker', 1);
    s = attacker.state;

    s = advanceToCombat(s);
    s = applyCommand(s, {
      type: 'ATTACK', playerId: active,
      attackerId: attacker.cardId,
      target: { kind: 'CARD', cardId: target.cardId },
    }).state;
    s = applyCommand(s, {
      type: 'ATTACK', playerId: active,
      attackerId: attacker.cardId,
      target: { kind: 'CARD', cardId: target.cardId },
    }).state;

    expect(s.cards[attacker.cardId].attacksThisTurn).toBe(2);
    expect(s.cards[attacker.cardId].exhausted).toBe(true);

    const third = applyCommand(s, {
      type: 'ATTACK', playerId: active,
      attackerId: attacker.cardId,
      target: { kind: 'CARD', cardId: target.cardId },
    });
    expect(
      third.events.some((e) => e.type === 'COMMAND_REJECTED' && e.reason === 'attacker_exhausted'),
    ).toBe(true);
  });

  it('обычная карта без frenzy истощается после первой атаки', () => {
    let s = setup();
    const active = s.activePlayer;
    const opp = opponentOf(active);

    const target = placeCard(s, opp, 'dummy', 1);
    s = target.state;
    const attacker = placeCard(s, active, 'plainAttacker', 1);
    s = attacker.state;

    s = advanceToCombat(s);
    s = applyCommand(s, {
      type: 'ATTACK', playerId: active,
      attackerId: attacker.cardId,
      target: { kind: 'CARD', cardId: target.cardId },
    }).state;

    expect(s.cards[attacker.cardId].exhausted).toBe(true);

    const again = applyCommand(s, {
      type: 'ATTACK', playerId: active,
      attackerId: attacker.cardId,
      target: { kind: 'CARD', cardId: target.cardId },
    });
    expect(again.events.some((e) => e.type === 'COMMAND_REJECTED')).toBe(true);
  });
});
