import { describe, it, expect } from 'vitest';
import { createGame } from '../state/create';
import { applyCommand } from '../commands/applyCommand';
import { health } from '../state/helpers';
import type { CardDefinition } from '@aspects/cards';
import type { GameState } from '../types/state';
import type { CardInstanceId, ColumnIndex, PlayerId } from '../types/ids';
import { opponentOf } from '../types/ids';


const defs: Record<string, CardDefinition> = {
  cleaver: {
    id: 'cleaver', name: 'Рассекатель', personalityTag: 'cleaver', tags: [],
    cost: 4, strength: 4, health: 3, rarity: 'common',
    abilities: ['cleave'], cleaveDamage: 1,
    triggers: [], activatedAbilities: [],
  } as any,
  cleaverHeavy: {
    id: 'cleaverHeavy', name: 'Тяжёлый рассекатель', personalityTag: 'cleaverHeavy', tags: [],
    cost: 4, strength: 4, health: 3, rarity: 'common',
    abilities: ['cleave'], cleaveDamage: 3,
    triggers: [], activatedAbilities: [],
  } as any,
  plainAttacker: {
    id: 'plainAttacker', name: 'Атакующий', personalityTag: 'plainAttacker', tags: [],
    cost: 3, strength: 4, health: 3, rarity: 'common',
    abilities: [], triggers: [], activatedAbilities: [],
  } as any,
  dummy: {
    id: 'dummy', name: 'Болван', personalityTag: 'dummy', tags: [],
    cost: 1, strength: 0, health: 10, rarity: 'common',
    abilities: [], triggers: [], activatedAbilities: [],
  } as any,
  armoredDummy: {
    id: 'armoredDummy', name: 'Бронированный болван', personalityTag: 'armoredDummy', tags: [],
    cost: 1, strength: 0, health: 10, rarity: 'common',
    abilities: ['armored'], triggers: [], activatedAbilities: [],
  } as any,
};

const deck = [
  ...Array(6).fill('cleaver'),
  ...Array(6).fill('cleaverHeavy'),
  ...Array(6).fill('plainAttacker'),
  ...Array(8).fill('dummy'),
  ...Array(4).fill('armoredDummy'),
];

function setup(seed = 'cleave'): GameState {
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
  const cardId = pool.find((id) => state.cards[id].definitionId === defId)!;
  const nb = state.board.map((c) => ({ ...c }));
  const col = nb[column - 1];
  if (playerId === 'p1') col.p1Front = cardId;
  else col.p2Front = cardId;
  return {
    state: {
      ...state,
      board: nb,
      cards: { ...state.cards, [cardId]: { ...state.cards[cardId], zone: 'FRONT' as const, column, exhausted: false } },
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

describe('cleave', () => {
  it('атака с cleave наносит урон соседям цели', () => {
    let s = setup();
    const active = s.activePlayer;
    const opp = opponentOf(active);

    const left = placeCard(s, opp, 'dummy', 1);
    s = left.state;
    const middle = placeCard(s, opp, 'dummy', 2);
    s = middle.state;
    const right = placeCard(s, opp, 'dummy', 3);
    s = right.state;
    const attacker = placeCard(s, active, 'cleaver', 2);
    s = attacker.state;

    s = advanceToCombat(s);
    const r = applyCommand(s, {
      type: 'ATTACK', playerId: active,
      attackerId: attacker.cardId,
      target: { kind: 'CARD', cardId: middle.cardId },
    });

    expect(health(r.state.cards[middle.cardId])).toBe(6);
    expect(health(r.state.cards[left.cardId])).toBe(9);
    expect(health(r.state.cards[right.cardId])).toBe(9);
  });

  it('соседи не отвечают ударом (атакующий теряет только HP цели)', () => {
    let s = setup();
    const active = s.activePlayer;
    const opp = opponentOf(active);

    const left = placeCard(s, opp, 'plainAttacker', 1);
    s = left.state;
    const middle = placeCard(s, opp, 'dummy', 2);
    s = middle.state;
    const attacker = placeCard(s, active, 'cleaver', 2);
    s = attacker.state;

    s = advanceToCombat(s);
    const r = applyCommand(s, {
      type: 'ATTACK', playerId: active,
      attackerId: attacker.cardId,
      target: { kind: 'CARD', cardId: middle.cardId },
    });

    expect(health(r.state.cards[attacker.cardId])).toBe(3);
  });

  it('cleaveDamage настраивается (default 1, кастом 3)', () => {
    let s = setup('cleave-custom');
    const active = s.activePlayer;
    const opp = opponentOf(active);

    const left = placeCard(s, opp, 'dummy', 1);
    s = left.state;
    const middle = placeCard(s, opp, 'dummy', 2);
    s = middle.state;
    const attacker = placeCard(s, active, 'cleaverHeavy', 2);
    s = attacker.state;

    s = advanceToCombat(s);
    const r = applyCommand(s, {
      type: 'ATTACK', playerId: active,
      attackerId: attacker.cardId,
      target: { kind: 'CARD', cardId: middle.cardId },
    });

    expect(health(r.state.cards[left.cardId])).toBe(7); // 10 - 3
  });

  it('armored у соседа уменьшает cleave-урон до 0', () => {
    let s = setup('cleave-armor');
    const active = s.activePlayer;
    const opp = opponentOf(active);

    const left = placeCard(s, opp, 'armoredDummy', 1);
    s = left.state;
    const middle = placeCard(s, opp, 'dummy', 2);
    s = middle.state;
    const attacker = placeCard(s, active, 'cleaver', 2);
    s = attacker.state;

    s = advanceToCombat(s);
    const r = applyCommand(s, {
      type: 'ATTACK', playerId: active,
      attackerId: attacker.cardId,
      target: { kind: 'CARD', cardId: middle.cardId },
    });

    expect(health(r.state.cards[left.cardId])).toBe(10);
  });
});
