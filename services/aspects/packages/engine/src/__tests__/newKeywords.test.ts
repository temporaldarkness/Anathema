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
    abilities: ['armored', 'taunt'],
    triggers: [], activatedAbilities: [],
  } as any,

  regen5: {
    id: 'regen5', name: 'Регенерирующий', personalityTag: 'regen5', tags: [],
    cost: 2, strength: 1, health: 5, rarity: 'common',
    abilities: ['regenerate'],
    triggers: [], activatedAbilities: [],
  } as any,

  cleaver: {
    id: 'cleaver', name: 'Рассекатель', personalityTag: 'cleaver', tags: [],
    cost: 4, strength: 4, health: 2, rarity: 'common',
    abilities: ['cleave'], cleaveDamage: 1,
    triggers: [], activatedAbilities: [],
  } as any,

  cleaver2: {
    id: 'cleaver2', name: 'Рассекатель X', personalityTag: 'cleaver2', tags: [],
    cost: 4, strength: 4, health: 2, rarity: 'common',
    abilities: ['cleave'], cleaveDamage: 2,
    triggers: [], activatedAbilities: [],
  } as any,

  frenzyCard: {
    id: 'frenzyCard', name: 'Яростный', personalityTag: 'frenzyCard', tags: [],
    cost: 3, strength: 3, health: 3, rarity: 'common',
    abilities: ['frenzy'],
    triggers: [], activatedAbilities: [],
  } as any,

  plain3: {
    id: 'plain3', name: 'Пехотинец', personalityTag: 'plain3', tags: [],
    cost: 3, strength: 3, health: 3, rarity: 'common',
    abilities: [],
    triggers: [], activatedAbilities: [],
  } as any,

  dummy: {
    id: 'dummy', name: 'Болван', personalityTag: 'dummy', tags: [],
    cost: 1, strength: 0, health: 10, rarity: 'common',
    abilities: [],
    triggers: [], activatedAbilities: [],
  } as any,

  attacker2: {
    id: 'attacker2', name: 'Атакующий-2', personalityTag: 'attacker2', tags: [],
    cost: 1, strength: 3, health: 5, rarity: 'common',
    abilities: ['charge'],
    triggers: [], activatedAbilities: [],
  } as any,
};

const deck = [
  ...Array(4).fill('armoredWall'),
  ...Array(4).fill('regen5'),
  ...Array(3).fill('cleaver'),
  ...Array(3).fill('cleaver2'),
  ...Array(3).fill('frenzyCard'),
  ...Array(3).fill('plain3'),
  ...Array(5).fill('dummy'),
  ...Array(5).fill('attacker2'),
]; // 4+4+3+3+3+3+5+5 = 30

function setup(seed = 'keywords'): GameState {
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

function placeCard(
  state: GameState,
  playerId: PlayerId,
  defId: string,
  column: ColumnIndex,
  zone: 'FRONT' | 'RESERVE' = 'FRONT',
): { state: GameState; cardId: CardInstanceId } {
  const player = state.players[playerId];
  const pool = [...player.hand, ...player.deck];
  const cardId = pool.find((id) => state.cards[id].definitionId === defId);
  if (!cardId) throw new Error(`No ${defId} for ${playerId}`);
  const newHand = player.hand.filter((id) => id !== cardId);
  const newDeck = player.deck.filter((id) => id !== cardId);
  const newBoard = state.board.map((c) => ({ ...c }));
  const col = newBoard[column - 1];
  if (playerId === 'p1') {
    if (zone === 'FRONT') col.p1Front = cardId;
    else col.p1Reserve = cardId;
  } else {
    if (zone === 'FRONT') col.p2Front = cardId;
    else col.p2Reserve = cardId;
  }
  return {
    state: {
      ...state,
      board: newBoard,
      cards: { ...state.cards, [cardId]: { ...state.cards[cardId], zone, column, exhausted: false } },
      players: { ...state.players, [playerId]: { ...player, hand: newHand, deck: newDeck } },
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
  it('уменьшает входящий урон на 1', () => {
    let s = setup();
    const active = s.activePlayer;
    const opp = opponentOf(active);

    const w = placeCard(s, opp, 'armoredWall', 1, 'FRONT');
    s = w.state;
    const a = placeCard(s, active, 'attacker2', 1, 'FRONT'); // 3 силы
    s = a.state;

    s = advanceToCombat(s);
    const r = applyCommand(s, {
      type: 'ATTACK', playerId: active,
      attackerId: a.cardId,
      target: { kind: 'CARD', cardId: w.cardId },
    });

    expect(health(r.state.cards[w.cardId])).toBe(3); // 5 - (3 - 1) = 3
    expect(r.events.some((e) => e.type === 'DAMAGE_ABSORBED' && (e as any).reason === 'armor')).toBe(true);
  });

  it('складывается с колонкой 4 при контроле', () => {
    let s = setup();
    const active = s.activePlayer;
    const opp = opponentOf(active);

    const newBoard = s.board.map((c, i) => i === 3 ? { ...c, neutralOwner: opp as PlayerId } : c);
    s = { ...s, board: newBoard };

    const w = placeCard(s, opp, 'armoredWall', 1, 'FRONT');
    s = w.state;
    const a = placeCard(s, active, 'attacker2', 1, 'FRONT');
    s = a.state;

    s = advanceToCombat(s);
    const r = applyCommand(s, {
      type: 'ATTACK', playerId: active,
      attackerId: a.cardId,
      target: { kind: 'CARD', cardId: w.cardId },
    });

    expect(health(r.state.cards[w.cardId])).toBe(4); // 5 - (3-1-1) = 4
  });
});

describe('regenerate', () => {
  it('восстанавливает 1 HP в конце хода владельца', () => {
    let s = setup();
    const active = s.activePlayer;
    const opp = opponentOf(active);

    const r5 = placeCard(s, active, 'regen5', 1, 'FRONT');
    s = r5.state;
    const a = placeCard(s, opp, 'attacker2', 1, 'FRONT');
    s = a.state;

    while (s.activePlayer !== opp && !s.winner) {
      s = applyCommand(s, { type: 'END_TURN', playerId: s.activePlayer }).state;
    }
    s = advanceToCombat(s);
    s = applyCommand(s, {
      type: 'ATTACK', playerId: opp,
      attackerId: a.cardId,
      target: { kind: 'CARD', cardId: r5.cardId },
    }).state;

    expect(s.cards[r5.cardId].damageTaken).toBe(3);

    s = applyCommand(s, { type: 'END_TURN', playerId: opp }).state;
    while (s.phase !== 'COMBAT' && !s.pendingChoice && !s.winner) {
      s = applyCommand(s, { type: 'ADVANCE_PHASE', playerId: s.activePlayer }).state;
    }
    s = applyCommand(s, { type: 'END_TURN', playerId: active }).state;

    expect(s.cards[r5.cardId].damageTaken).toBe(2);
  });

  it('не восстанавливает сверх максимума', () => {
    let s = setup();
    const active = s.activePlayer;

    const r5 = placeCard(s, active, 'regen5', 1, 'FRONT');
    s = r5.state;

    while (s.phase !== 'COMBAT' && !s.pendingChoice && !s.winner) {
      s = applyCommand(s, { type: 'ADVANCE_PHASE', playerId: s.activePlayer }).state;
    }
    s = applyCommand(s, { type: 'END_TURN', playerId: active }).state;

    expect(s.cards[r5.cardId].damageTaken).toBe(0);
  });
});

describe('cleave', () => {
  it('соседи получают cleaveDamage', () => {
    let s = setup();
    const active = s.activePlayer;
    const opp = opponentOf(active);

    const left = placeCard(s, opp, 'dummy', 1, 'FRONT');
    s = left.state;
    const middle = placeCard(s, opp, 'dummy', 2, 'FRONT');
    s = middle.state;
    const right = placeCard(s, opp, 'dummy', 3, 'FRONT');
    s = right.state;

    const attacker = placeCard(s, active, 'cleaver', 2, 'FRONT');
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

  it('cleaveDamage=2 даёт 2 урона соседям', () => {
    let s = setup();
    const active = s.activePlayer;
    const opp = opponentOf(active);

    const left = placeCard(s, opp, 'dummy', 1, 'FRONT');
    s = left.state;
    const middle = placeCard(s, opp, 'dummy', 2, 'FRONT');
    s = middle.state;

    const attacker = placeCard(s, active, 'cleaver2', 2, 'FRONT');
    s = attacker.state;

    s = advanceToCombat(s);
    const r = applyCommand(s, {
      type: 'ATTACK', playerId: active,
      attackerId: attacker.cardId,
      target: { kind: 'CARD', cardId: middle.cardId },
    });

    expect(health(r.state.cards[left.cardId])).toBe(8);
  });

  it('соседи не отвечают ответным ударом', () => {
    let s = setup();
    const active = s.activePlayer;
    const opp = opponentOf(active);

    const left = placeCard(s, opp, 'plain3', 1, 'FRONT');
    s = left.state;
    const middle = placeCard(s, opp, 'dummy', 2, 'FRONT');
    s = middle.state;

    const attacker = placeCard(s, active, 'cleaver', 2, 'FRONT');
    s = attacker.state;

    s = advanceToCombat(s);
    const r = applyCommand(s, {
      type: 'ATTACK', playerId: active,
      attackerId: attacker.cardId,
      target: { kind: 'CARD', cardId: middle.cardId },
    });

    expect(health(r.state.cards[attacker.cardId])).toBe(2);
  });
});

describe('frenzy', () => {
  it('может атаковать дважды за ход', () => {
    let s = setup();
    const active = s.activePlayer;
    const opp = opponentOf(active);

    const target = placeCard(s, opp, 'dummy', 1, 'FRONT');
    s = target.state;
    const attacker = placeCard(s, active, 'frenzyCard', 1, 'FRONT');
    s = attacker.state;

    s = advanceToCombat(s);

    s = applyCommand(s, {
      type: 'ATTACK', playerId: active,
      attackerId: attacker.cardId,
      target: { kind: 'CARD', cardId: target.cardId },
    }).state;

    expect(s.cards[attacker.cardId].attacksThisTurn).toBe(1);
    expect(s.cards[attacker.cardId].exhausted).toBe(false);

    s = applyCommand(s, {
      type: 'ATTACK', playerId: active,
      attackerId: attacker.cardId,
      target: { kind: 'CARD', cardId: target.cardId },
    }).state;

    expect(s.cards[attacker.cardId].attacksThisTurn).toBe(2);
    expect(s.cards[attacker.cardId].exhausted).toBe(true);
    expect(health(s.cards[target.cardId])).toBe(4);
  });

  it('обычная карта истощается после первой атаки', () => {
    let s = setup();
    const active = s.activePlayer;
    const opp = opponentOf(active);

    const target = placeCard(s, opp, 'dummy', 1, 'FRONT');
    s = target.state;
    const attacker = placeCard(s, active, 'plain3', 1, 'FRONT');
    s = attacker.state;

    s = advanceToCombat(s);
    s = applyCommand(s, {
      type: 'ATTACK', playerId: active,
      attackerId: attacker.cardId,
      target: { kind: 'CARD', cardId: target.cardId },
    }).state;

    expect(s.cards[attacker.cardId].exhausted).toBe(true);

    const r = applyCommand(s, {
      type: 'ATTACK', playerId: active,
      attackerId: attacker.cardId,
      target: { kind: 'CARD', cardId: target.cardId },
    });
    expect(r.events.some((e) => e.type === 'COMMAND_REJECTED' && e.reason === 'attacker_exhausted')).toBe(true);
  });

  it('attacksThisTurn сбрасывается в RESTORE', () => {
    let s = setup();
    const active = s.activePlayer;
    const opp = opponentOf(active);

    const target = placeCard(s, opp, 'dummy', 1, 'FRONT');
    s = target.state;
    const attacker = placeCard(s, active, 'frenzyCard', 1, 'FRONT');
    s = attacker.state;

    s = advanceToCombat(s);
    s = applyCommand(s, {
      type: 'ATTACK', playerId: active,
      attackerId: attacker.cardId,
      target: { kind: 'CARD', cardId: target.cardId },
    }).state;

    expect(s.cards[attacker.cardId].attacksThisTurn).toBe(1);

    s = applyCommand(s, { type: 'END_TURN', playerId: active }).state;
    while (s.activePlayer !== active && !s.winner) {
      if (s.phase === 'PLAY' || s.phase === 'COMBAT') {
        s = applyCommand(s, { type: 'END_TURN', playerId: s.activePlayer }).state;
      } else {
        s = applyCommand(s, { type: 'ADVANCE_PHASE', playerId: s.activePlayer }).state;
      }
    }
    s = advanceToCombat(s);
    expect(s.cards[attacker.cardId].exhausted).toBe(false);
  });
});