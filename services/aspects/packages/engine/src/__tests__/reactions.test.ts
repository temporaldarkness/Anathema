import { describe, it, expect } from 'vitest';
import { createGame } from '../state/create';
import { applyCommand } from '../commands/applyCommand';
import { health } from '../state/helpers';
import type { CardDefinition } from '@aspects/cards';
import type { GameState } from '../types/state';
import type { ColumnIndex, PlayerId } from '../types/ids';
import { opponentOf } from '../types/ids';

const defs: Record<string, CardDefinition> = {
  librarian: {
    id: 'librarian', name: 'Библиотекарь', personalityTag: 'librarian', tags: [],
    cost: 1, strength: 2, health: 3, rarity: 'common',
    abilities: ['charge'],
    triggers: [{
      id: 'lib-damaged',
      trigger: 'ON_THIS_DAMAGED',
      oncePerTurn: true,
      effects: [{ kind: 'DRAW', count: 1, who: 'SELF' }],
    }],
    activatedAbilities: [],
  } as any,

  avenger: {
    id: 'avenger', name: 'Мститель', personalityTag: 'avenger', tags: [],
    cost: 1, strength: 2, health: 2, rarity: 'common',
    abilities: ['charge'],
    triggers: [{
      id: 'avenge',
      trigger: 'ON_ALLY_ATTACKED',
      effects: [{ kind: 'BUFF', strength: 1, health: 0, target: 'SELF' }],
    }],
    activatedAbilities: [],
  } as any,

  defensive: {
    id: 'defensive', name: 'Обороняющийся', personalityTag: 'defensive', tags: [],
    cost: 1, strength: 1, health: 3, rarity: 'common',
    abilities: ['charge'],
    triggers: [{
      id: 'def-damage',
      trigger: 'ON_ENEMY_ATTACK',
      oncePerTurn: true,
      effects: [{ kind: 'DEAL_DAMAGE', amount: 1, target: 'ALL_ENEMY_FRONT' }],
    }],
    activatedAbilities: [],
  } as any,

  plain: {
    id: 'plain', name: 'Пехотинец', personalityTag: 'plain', tags: [],
    cost: 1, strength: 1, health: 1, rarity: 'common',
    abilities: ['charge'],
    triggers: [],
    activatedAbilities: [],
  } as any,

  titan: {
    id: 'titan', name: 'Титан', personalityTag: 'titan', tags: [],
    cost: 1, strength: 5, health: 5, rarity: 'common',
    abilities: ['charge'],
    triggers: [],
    activatedAbilities: [],
  } as any,
};

const deck = [
  ...Array(6).fill('librarian'),
  ...Array(6).fill('avenger'),
  ...Array(6).fill('defensive'),
  ...Array(6).fill('plain'),
  ...Array(6).fill('titan'),
];

function setup(seed = 'reactions'): GameState {
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

function place(state: GameState, pid: PlayerId, defId: string, col: ColumnIndex) {
  const pool = [...state.players[pid].hand, ...state.players[pid].deck];
  const cid = pool.find((id) => state.cards[id].definitionId === defId)!;
  if (!cid) throw new Error(`No ${defId} for ${pid}`);
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

function advanceToCombat(state: GameState): GameState {
  let s = state;
  while (s.phase !== 'COMBAT' && !s.pendingChoice) {
    s = applyCommand(s, { type: 'ADVANCE_PHASE', playerId: s.activePlayer }).state;
  }
  return s;
}

describe('ON_THIS_DAMAGED', () => {
  it('срабатывает, когда карта получает урон', () => {
    let s = setup();
    const active = s.activePlayer;
    const opponent = opponentOf(active);

    const lib = place(s, opponent, 'librarian', 1);
    s = lib.state;
    const titan = place(s, active, 'titan', 1);
    s = titan.state;

    s = advanceToCombat(s);
    const handBefore = s.players[opponent].hand.length;

    const r = applyCommand(s, {
      type: 'ATTACK',
      playerId: active,
      attackerId: titan.cardId,
      target: { kind: 'CARD', cardId: lib.cardId },
    });

    expect(r.events.some((e) => e.type === 'COMMAND_REJECTED')).toBe(false);
    expect(r.state.cards[lib.cardId].zone).toBe('DISCARD');
    expect(r.state.players[opponent].hand.length).toBe(handBefore);
  });

  it('срабатывает, если карта выжила', () => {
    let s = setup();
    const active = s.activePlayer;
    const opponent = opponentOf(active);

    const lib = place(s, opponent, 'librarian', 1);
    s = lib.state;
    const plain = place(s, active, 'plain', 1);
    s = plain.state;

    s = advanceToCombat(s);
    const handBefore = s.players[opponent].hand.length;

    const r = applyCommand(s, {
      type: 'ATTACK',
      playerId: active,
      attackerId: plain.cardId,
      target: { kind: 'CARD', cardId: lib.cardId },
    });

    expect(r.state.cards[lib.cardId].zone).toBe('FRONT');
    expect(r.state.players[opponent].hand.length).toBe(handBefore + 1);
  });

  it('oncePerTurn: второй удар в тот же ход не активирует', () => {
    let s = setup();
    const active = s.activePlayer;
    const opponent = opponentOf(active);

    const lib = place(s, opponent, 'librarian', 1);
    s = lib.state;
    const e2 = place(s, opponent, 'plain', 2);
    s = e2.state;

    const t1 = place(s, active, 'titan', 1);
    s = t1.state;
    const t2 = place(s, active, 'titan', 2);
    s = t2.state;

    s = advanceToCombat(s);
    const handBefore = s.players[opponent].hand.length;

    s = applyCommand(s, {
      type: 'ATTACK',
      playerId: active,
      attackerId: t1.cardId,
      target: { kind: 'CARD', cardId: lib.cardId },
    }).state;

    expect(s.cards[lib.cardId].zone).toBe('DISCARD');
  });

  it('oncePerTurn: карта получает урон дважды, но триггер сработал один раз', () => {
    const localDefs: Record<string, CardDefinition> = {
      tank: {
        id: 'tank', name: 'Танк', personalityTag: 'tank', tags: [],
        cost: 1, strength: 1, health: 10, rarity: 'common',
        abilities: ['charge'],
        triggers: [{
          id: 'tank-damaged',
          trigger: 'ON_THIS_DAMAGED',
          oncePerTurn: true,
          effects: [{ kind: 'DRAW', count: 1, who: 'SELF' }],
        }],
        activatedAbilities: [],
      } as any,
      hit: {
        id: 'hit', name: 'Удар', personalityTag: 'hit', tags: [],
        cost: 1, strength: 1, health: 1, rarity: 'common',
        abilities: ['charge'],
        triggers: [],
        activatedAbilities: [],
      } as any,
    };
    const d = [
      ...Array(15).fill('tank'),
      ...Array(15).fill('hit'),
    ];

    let s = createGame({
      seed: 'oncedamage',
      decks: { p1: d, p2: d },
      cardDefinitions: localDefs,
    }).state;
    while (s.phase !== 'PLAY') {
      s = applyCommand(s, { type: 'ADVANCE_PHASE', playerId: s.activePlayer }).state;
    }
    const active = s.activePlayer;
    const opponent = opponentOf(active);

    const tank = place(s, opponent, 'tank', 1);
    s = tank.state;
    const a1 = place(s, active, 'hit', 1);
    s = a1.state;
    const a2 = place(s, active, 'hit', 2);
    s = a2.state;

    s = advanceToCombat(s);
    const handBefore = s.players[opponent].hand.length;

    s = applyCommand(s, {
      type: 'ATTACK',
      playerId: active,
      attackerId: a1.cardId,
      target: { kind: 'CARD', cardId: tank.cardId },
    }).state;

    const handMid = s.players[opponent].hand.length;
    expect(handMid).toBe(handBefore + 1);

    s = applyCommand(s, {
      type: 'ATTACK',
      playerId: active,
      attackerId: a2.cardId,
      target: { kind: 'CARD', cardId: tank.cardId },
    }).state;

    expect(s.players[opponent].hand.length).toBe(handMid);
  });
});

describe('ON_ALLY_ATTACKED', () => {
  it('срабатывает у союзников атакованной карты', () => {
    let s = setup();
    const active = s.activePlayer;
    const opponent = opponentOf(active);

    const avenger = place(s, opponent, 'avenger', 2);
    s = avenger.state;
    const plain = place(s, opponent, 'plain', 1);
    s = plain.state;

    const titan = place(s, active, 'titan', 1);
    s = titan.state;

    s = advanceToCombat(s);

    const r = applyCommand(s, {
      type: 'ATTACK',
      playerId: active,
      attackerId: titan.cardId,
      target: { kind: 'CARD', cardId: plain.cardId },
    });

    expect(r.state.cards[avenger.cardId].modifiers.length).toBeGreaterThan(0);
    const card = r.state.cards[avenger.cardId];
    let str = card.baseStrength;
    for (const m of card.modifiers) if (m.stat === 'strength') str += m.delta;
    expect(str).toBe(3);
  });
});

describe('ON_ENEMY_ATTACK', () => {
  it('срабатывает у всех карт противника во Фронте', () => {
    let s = setup();
    const active = s.activePlayer;
    const opponent = opponentOf(active);

    const def = place(s, opponent, 'defensive', 1);
    s = def.state;
    const plain = place(s, opponent, 'plain', 2);
    s = plain.state;

    const titan = place(s, active, 'titan', 1);
    s = titan.state;

    s = advanceToCombat(s);

    const r = applyCommand(s, {
      type: 'ATTACK',
      playerId: active,
      attackerId: titan.cardId,
      target: { kind: 'CARD', cardId: plain.cardId },
    });

    expect(health(r.state.cards[titan.cardId])).toBe(3);
  });
});