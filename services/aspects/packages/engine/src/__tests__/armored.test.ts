import { describe, it, expect } from 'vitest';
import { createGame } from '../state/create';
import { applyCommand } from '../commands/applyCommand';
import { health } from '../state/helpers';
import type { CardDefinition } from '@aspects/cards';
import type { GameState } from '../types/state';
import type { CardInstanceId, ColumnIndex, PlayerId } from '../types/ids';
import { opponentOf } from '../types/ids';

const defs: Record<string, CardDefinition> = {
  armoredWall: {
    id: 'armoredWall', name: 'Окопник', personalityTag: 'armoredWall', tags: [],
    cost: 2, strength: 0, health: 5, rarity: 'common',
    abilities: ['armored'], triggers: [], activatedAbilities: [],
  } as any,
  weakAttacker: {
    id: 'weakAttacker', name: 'Слабый удар', personalityTag: 'weakAttacker', tags: [],
    cost: 1, strength: 1, health: 3, rarity: 'common',
    abilities: [], triggers: [], activatedAbilities: [],
  } as any,
  attacker: {
    id: 'attacker', name: 'Воин', personalityTag: 'attacker', tags: [],
    cost: 2, strength: 3, health: 4, rarity: 'common',
    abilities: [], triggers: [], activatedAbilities: [],
  } as any,
};

const deck = [
  ...Array(10).fill('armoredWall'),
  ...Array(10).fill('weakAttacker'),
  ...Array(10).fill('attacker'),
];

function setup(seed = 'armored'): GameState {
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

describe('armored', () => {
  it('входящий урон уменьшается на 1', () => {
    let s = setup();
    const active = s.activePlayer;
    const opp = opponentOf(active);

    const wall = placeCard(s, opp, 'armoredWall', 1);
    s = wall.state;
    const atk = placeCard(s, active, 'attacker', 1); // сила 3
    s = atk.state;

    s = advanceToCombat(s);
    const r = applyCommand(s, {
      type: 'ATTACK', playerId: active,
      attackerId: atk.cardId,
      target: { kind: 'CARD', cardId: wall.cardId },
    });

    expect(health(r.state.cards[wall.cardId])).toBe(3);
    expect(
      r.events.some((e) => e.type === 'DAMAGE_ABSORBED' && (e as any).reason === 'armor'),
    ).toBe(true);
  });

  it('складывается с бонусом колонки 4 (damageReduction)', () => {
    let s = setup();
    const active = s.activePlayer;
    const opp = opponentOf(active);

    const newBoard = s.board.map((c, i) =>
      i === 3 ? { ...c, neutralOwner: opp as PlayerId } : c,
    );
    s = { ...s, board: newBoard };

    const wall = placeCard(s, opp, 'armoredWall', 1);
    s = wall.state;
    const atk = placeCard(s, active, 'attacker', 1);
    s = atk.state;

    s = advanceToCombat(s);
    const r = applyCommand(s, {
      type: 'ATTACK', playerId: active,
      attackerId: atk.cardId,
      target: { kind: 'CARD', cardId: wall.cardId },
    });

    expect(health(r.state.cards[wall.cardId])).toBe(4);
  });

  it('урон не может стать меньше 0', () => {
    let s = setup();
    const active = s.activePlayer;
    const opp = opponentOf(active);

    const newBoard = s.board.map((c, i) =>
      i === 3 ? { ...c, neutralOwner: opp as PlayerId } : c,
    );
    s = { ...s, board: newBoard };

    const wall = placeCard(s, opp, 'armoredWall', 1);
    s = wall.state;
    const atk = placeCard(s, active, 'weakAttacker', 1);
    s = atk.state;

    s = advanceToCombat(s);
    const r = applyCommand(s, {
      type: 'ATTACK', playerId: active,
      attackerId: atk.cardId,
      target: { kind: 'CARD', cardId: wall.cardId },
    });

    expect(health(r.state.cards[wall.cardId])).toBe(5);
    expect(r.state.cards[wall.cardId].damageTaken).toBe(0);
  });
});
