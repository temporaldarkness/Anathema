import { describe, it, expect } from 'vitest';
import { createGame } from '../state/create';
import { applyCommand } from '../commands/applyCommand';
import { health, strength } from '../state/helpers';
import type { CardDefinition } from '@aspects/cards';
import type { GameState } from '../types/state';
import type { ColumnIndex, PlayerId } from '../types/ids';
import { opponentOf } from '../types/ids';

const defs: Record<string, CardDefinition> = {
  pyromancer: {
    id: 'pyromancer', name: 'Пиромант', personalityTag: 'pyromancer', tags: [],
    cost: 1, strength: 2, health: 3, rarity: 'common',
    abilities: ['charge'],
    triggers: [],
    activatedAbilities: [
      {
        id: 'flame',
        cost: 0,
        effects: [{ kind: 'DEAL_DAMAGE', amount: 1, target: 'ALL_ENEMY_FRONT' }],
      },
    ],
  } as any,

  scholar: {
    id: 'scholar', name: 'Учёный', personalityTag: 'scholar', tags: [],
    cost: 1, strength: 1, health: 1, rarity: 'common',
    abilities: ['charge'],
    triggers: [],
    activatedAbilities: [
      {
        id: 'study',
        cost: 2,
        effects: [{ kind: 'DRAW', count: 1, who: 'SELF' }],
      },
    ],
  } as any,

  mage: {
    id: 'mage', name: 'Маг', personalityTag: 'mage', tags: [],
    cost: 2, strength: 2, health: 4, rarity: 'common',
    abilities: ['charge'],
    triggers: [],
    activatedAbilities: [
      {
        id: 'bolt',
        cost: 1,
        effects: [
          {
            kind: 'CHOOSE_TARGETS_THEN',
            selection: { from: 'ENEMY_FRONT', count: 1 },
            then: [{ kind: 'DEAL_DAMAGE', amount: 4, target: 'CHOSEN' }],
          },
        ],
      },
    ],
  } as any,

  plain: {
    id: 'plain', name: 'Пехотинец', personalityTag: 'plain', tags: [],
    cost: 1, strength: 1, health: 5, rarity: 'common',
    abilities: [],
    triggers: [],
    activatedAbilities: [],
  } as any,
};

const deck = [
  ...Array(8).fill('pyromancer'),
  ...Array(8).fill('scholar'),
  ...Array(6).fill('mage'),
  ...Array(8).fill('plain'),
];

function setup(seed = 'use-ability'): GameState {
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

describe('USE_ABILITY', () => {
  it('применяет эффект, списывает Влияние', () => {
    let s = setup();
    const active = s.activePlayer;
    const opponent = opponentOf(active);

    const caster = place(s, active, 'pyromancer', 1);
    s = caster.state;
    const victim = place(s, opponent, 'plain', 1);
    s = victim.state;

    const before = health(s.cards[victim.cardId]);

    const r = applyCommand(s, {
      type: 'USE_ABILITY',
      playerId: active,
      cardId: caster.cardId,
      abilityIndex: 0,
    });

    expect(r.events.some((e) => e.type === 'COMMAND_REJECTED')).toBe(false);
    expect(health(r.state.cards[victim.cardId])).toBe(before - 1);
    expect(r.state.cards[caster.cardId].usedAbilitiesThisTurn).toContain(0);
  });

  it('нельзя использовать дважды в ход', () => {
    let s = setup();
    const active = s.activePlayer;
    const opponent = opponentOf(active);

    const caster = place(s, active, 'pyromancer', 1);
    s = caster.state;
    place(s, opponent, 'plain', 1);
    s = place(s, opponent, 'plain', 1).state;

    s = applyCommand(s, {
      type: 'USE_ABILITY',
      playerId: active,
      cardId: caster.cardId,
      abilityIndex: 0,
    }).state;

    const r = applyCommand(s, {
      type: 'USE_ABILITY',
      playerId: active,
      cardId: caster.cardId,
      abilityIndex: 0,
    });

    expect(
      r.events.some((e) => e.type === 'COMMAND_REJECTED' && e.reason === 'ability_already_used'),
    ).toBe(true);
  });

  it('недостаточно Влияния — отказ', () => {
    let s = setup();
    const active = s.activePlayer;

    s = {
      ...s,
      players: {
        ...s.players,
        [active]: { ...s.players[active], influence: 1 },
      },
    };

    const caster = place(s, active, 'scholar', 1);
    s = caster.state;

    const r = applyCommand(s, {
      type: 'USE_ABILITY',
      playerId: active,
      cardId: caster.cardId,
      abilityIndex: 0,
    });
    expect(
      r.events.some((e) => e.type === 'COMMAND_REJECTED' && e.reason === 'not_enough_influence'),
    ).toBe(true);
  });

  it('карта в Резерве — отказ', () => {
    let s = setup();
    const active = s.activePlayer;

    const pool = [...s.players[active].hand, ...s.players[active].deck];
    const cid = pool.find((id) => s.cards[id].definitionId === 'pyromancer')!;
    const nb = s.board.map((c) => ({ ...c }));
    nb[0].p1Reserve = cid;
    s = {
      ...s,
      board: nb,
      cards: { ...s.cards, [cid]: { ...s.cards[cid], zone: 'RESERVE' as const, column: 1 as ColumnIndex } },
      players: {
        ...s.players,
        [active]: {
          ...s.players[active],
          hand: s.players[active].hand.filter((i) => i !== cid),
          deck: s.players[active].deck.filter((i) => i !== cid),
        },
      },
    };

    const r = applyCommand(s, {
      type: 'USE_ABILITY',
      playerId: active,
      cardId: cid,
      abilityIndex: 0,
    });
    expect(
      r.events.some((e) => e.type === 'COMMAND_REJECTED' && e.reason === 'card_not_in_front'),
    ).toBe(true);
  });

  it('истощённая карта всё равно может использовать способность', () => {
    let s = setup();
    const active = s.activePlayer;
    const opponent = opponentOf(active);

    const caster = place(s, active, 'pyromancer', 1);
    s = caster.state;
    const victim = place(s, opponent, 'plain', 1);
    s = victim.state;

    s = {
      ...s,
      cards: { ...s.cards, [caster.cardId]: { ...s.cards[caster.cardId], exhausted: true } },
    };

    const before = health(s.cards[victim.cardId]);
    const r = applyCommand(s, {
      type: 'USE_ABILITY',
      playerId: active,
      cardId: caster.cardId,
      abilityIndex: 0,
    });
    expect(r.events.some((e) => e.type === 'COMMAND_REJECTED')).toBe(false);
    expect(health(r.state.cards[victim.cardId])).toBe(before - 1);
  });

  it('способность с CHOOSE_TARGETS_THEN ставит pendingChoice', () => {
    let s = setup();
    const active = s.activePlayer;
    const opponent = opponentOf(active);

    const caster = place(s, active, 'mage', 1);
    s = caster.state;
    const e1 = place(s, opponent, 'plain', 1);
    s = e1.state;
    const e2 = place(s, opponent, 'plain', 2);
    s = e2.state;

    s = applyCommand(s, {
      type: 'USE_ABILITY',
      playerId: active,
      cardId: caster.cardId,
      abilityIndex: 0,
    }).state;

    expect(s.pendingChoice).not.toBeNull();
    expect(s.pendingChoice!.kind).toBe('EFFECT_TARGET_SELECTION');
    expect(s.pendingChoice!.eligibleCardIds.length).toBe(2);
    expect(s.players[active].influence).toBe(9);
    expect(s.cards[caster.cardId].usedAbilitiesThisTurn).toContain(0);
  });

  it('CHOOSE_TARGETS_THEN: выбранная цель получает эффект', () => {
    let s = setup();
    const active = s.activePlayer;
    const opponent = opponentOf(active);

    const caster = place(s, active, 'mage', 1);
    s = caster.state;
    const e1 = place(s, opponent, 'plain', 1);
    s = e1.state;
    const e2 = place(s, opponent, 'plain', 2);
    s = e2.state;

    const beforeE1 = health(s.cards[e1.cardId]);
    const beforeE2 = health(s.cards[e2.cardId]);

    s = applyCommand(s, {
      type: 'USE_ABILITY',
      playerId: active,
      cardId: caster.cardId,
      abilityIndex: 0,
    }).state;

    const r = applyCommand(s, {
      type: 'RESOLVE_CHOICE',
      playerId: active,
      cardIds: [e1.cardId],
    });

    expect(health(r.state.cards[e1.cardId])).toBe(beforeE1 - 4);
    expect(health(r.state.cards[e2.cardId])).toBe(beforeE2);
  });

  it('счётчик сбрасывается в начале своего хода', () => {
    let s = setup();
    const active = s.activePlayer;
    const opponent = opponentOf(active);

    const caster = place(s, active, 'pyromancer', 1);
    s = caster.state;
    place(s, opponent, 'plain', 1);
    s = place(s, opponent, 'plain', 1).state;

    s = applyCommand(s, {
      type: 'USE_ABILITY',
      playerId: active,
      cardId: caster.cardId,
      abilityIndex: 0,
    }).state;

    expect(s.cards[caster.cardId].usedAbilitiesThisTurn).toContain(0);

    while (s.activePlayer !== opponent && !s.pendingChoice && !s.winner) {
      if (s.phase === 'PLAY' || s.phase === 'COMBAT') {
        s = applyCommand(s, { type: 'END_TURN', playerId: s.activePlayer }).state;
      } else {
        s = applyCommand(s, { type: 'ADVANCE_PHASE', playerId: s.activePlayer }).state;
      }
    }
    while (s.activePlayer !== active && !s.pendingChoice && !s.winner) {
      if (s.phase === 'PLAY' || s.phase === 'COMBAT') {
        s = applyCommand(s, { type: 'END_TURN', playerId: s.activePlayer }).state;
      } else {
        s = applyCommand(s, { type: 'ADVANCE_PHASE', playerId: s.activePlayer }).state;
      }
    }

    expect(s.cards[caster.cardId].usedAbilitiesThisTurn).toEqual([]);
  });

  it('чужая карта — отказ', () => {
    let s = setup();
    const active = s.activePlayer;
    const opponent = opponentOf(active);

    const enemy = place(s, opponent, 'pyromancer', 1);
    s = enemy.state;

    const r = applyCommand(s, {
      type: 'USE_ABILITY',
      playerId: active,
      cardId: enemy.cardId,
      abilityIndex: 0,
    });
    expect(
      r.events.some((e) => e.type === 'COMMAND_REJECTED' && e.reason === 'not_your_card'),
    ).toBe(true);
  });

  it('неверный индекс способности — отказ', () => {
    let s = setup();
    const active = s.activePlayer;

    const caster = place(s, active, 'pyromancer', 1);
    s = caster.state;

    const r = applyCommand(s, {
      type: 'USE_ABILITY',
      playerId: active,
      cardId: caster.cardId,
      abilityIndex: 5,
    });
    expect(
      r.events.some((e) => e.type === 'COMMAND_REJECTED' && e.reason === 'ability_index_out_of_range'),
    ).toBe(true);
  });
});