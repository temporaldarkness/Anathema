import { describe, it, expect } from 'vitest';
import { createGame } from '../state/create';
import { applyCommand } from '../commands/applyCommand';
import { health, cardAbilities, cardTriggers } from '../state/helpers';
import type { CardDefinition } from '@aspects/cards';
import type { GameState } from '../types/state';
import type { CardInstanceId, ColumnIndex, PlayerId } from '../types/ids';
import { opponentOf } from '../types/ids';

const defs: Record<string, CardDefinition> = {
  silencer: {
    id: 'silencer', name: 'Гаситель', personalityTag: 'silencer', tags: [],
    cost: 2, strength: 1, health: 3, rarity: 'common',
    abilities: [], triggers: [],
    activatedAbilities: [
      {
        id: 'silence-one',
        cost: 1,
        effects: [{ kind: 'SILENCE_TARGET', target: 'CHOSEN' }],
      },
    ],
  } as any,
  victim: {
    id: 'victim', name: 'Разносторонний', personalityTag: 'victim', tags: [],
    cost: 3, strength: 0, health: 6, rarity: 'common',
    abilities: ['frenzy'],
    triggers: [
      {
        trigger: 'ON_THIS_DAMAGED',
        effects: [{ kind: 'DEAL_DAMAGE', amount: 1, target: 'SELF' }],
      },
    ],
    activatedAbilities: [
      {
        id: 'self-buff',
        cost: 0,
        effects: [{ kind: 'BUFF', strength: 2, health: 0, target: 'SELF' }],
      },
    ],
  } as any,
  marked: {
    id: 'marked', name: 'Расписной голем', personalityTag: 'marked', tags: [],
    cost: 2, strength: 0, health: 6, rarity: 'common',
    abilities: ['taunt'], triggers: [], activatedAbilities: [],
  } as any,
  dummy: {
    id: 'dummy', name: 'Болван', personalityTag: 'dummy', tags: [],
    cost: 1, strength: 1, health: 10, rarity: 'common',
    abilities: [], triggers: [], activatedAbilities: [],
  } as any,
};

const deck = [
  ...Array(10).fill('silencer'),
  ...Array(10).fill('victim'),
  ...Array(10).fill('dummy'),
];


function setup(seed = 'silence'): GameState {
  const deckP2 = [...deck.slice(10), ...deck.slice(0, 10)];
  let s = createGame({ seed, decks: { p1: deck, p2: deckP2 }, cardDefinitions: defs }).state;
  while (s.phase !== 'PLAY' && !s.pendingChoice) {
    s = applyCommand(s, { type: 'ADVANCE_PHASE', playerId: s.activePlayer }).state;
  }
  const active = s.activePlayer;
  s = {
    ...s,
    players: {
      ...s.players,
      [active]: { ...s.players[active], influence: 10 },
    },
  };
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

function castSilence(state: GameState, casterId: CardInstanceId, targetId: CardInstanceId) {
  let r = applyCommand(state, {
    type: 'USE_ABILITY',
    playerId: state.activePlayer,
    cardId: casterId,
    abilityIndex: 0,
  });
  if (r.state.pendingChoice) {
    r = applyCommand(r.state, {
      type: 'RESOLVE_CHOICE',
      playerId: r.state.pendingChoice.playerId,
      cardIds: [targetId],
    });
  }
  return r;
}

describe('silence', () => {
  it('SILENCE_TARGET снимает все keywords', () => {
    let s = setup();
    const active = s.activePlayer;
    const opp = opponentOf(active);

    const caster = placeCard(s, active, 'silencer', 1);
    s = caster.state;
    const victim = placeCard(s, opp, 'victim', 1);
    s = victim.state;

    expect(cardAbilities(s, victim.cardId)).toContain('frenzy');

    const r = castSilence(s, caster.cardId, victim.cardId);
    s = r.state;

    expect(s.cards[victim.cardId].silenced).toBe(true);
    expect(cardAbilities(s, victim.cardId)).toEqual([]);
    expect(r.events.some((e) => e.type === 'CARD_SILENCED')).toBe(true);
  });

  it('SILENCE_TARGET снимает все triggers', () => {
    let s = setup();
    const active = s.activePlayer;
    const opp = opponentOf(active);

    const caster = placeCard(s, active, 'silencer', 1);
    s = caster.state;
    const victim = placeCard(s, opp, 'victim', 1);
    s = victim.state;

    expect(cardTriggers(s, victim.cardId).length).toBeGreaterThan(0);

    s = castSilence(s, caster.cardId, victim.cardId).state;
    expect(cardTriggers(s, victim.cardId)).toEqual([]);

    const beforeDamage = s.cards[victim.cardId].damageTaken;
    s = { ...s, phase: 'COMBAT' };
    const r = applyCommand(s, {
      type: 'ATTACK', playerId: active,
      attackerId: caster.cardId, // сила 1
      target: { kind: 'CARD', cardId: victim.cardId },
    });
    const v = r.state.cards[victim.cardId];
    expect(v.damageTaken).toBe(beforeDamage + 1);
  });

  it('silenced карта не может использовать способности', () => {
    let s = setup();
    const active = s.activePlayer;
    const opp = opponentOf(active);

    const caster = placeCard(s, active, 'silencer', 1);
    s = caster.state;
    const victim = placeCard(s, opp, 'victim', 1);
    s = victim.state;

    s = castSilence(s, caster.cardId, victim.cardId).state;

    while (s.activePlayer !== opp && !s.winner) {
      if (s.phase === 'PLAY' || s.phase === 'COMBAT') {
        s = applyCommand(s, { type: 'END_TURN', playerId: s.activePlayer }).state;
      } else {
        s = applyCommand(s, { type: 'ADVANCE_PHASE', playerId: s.activePlayer }).state;
      }
    }
    while (s.phase !== 'PLAY' && !s.pendingChoice && !s.winner) {
      s = applyCommand(s, { type: 'ADVANCE_PHASE', playerId: s.activePlayer }).state;
    }

    const r = applyCommand(s, {
      type: 'USE_ABILITY', playerId: opp,
      cardId: victim.cardId, abilityIndex: 0,
    });
    expect(
      r.events.some((e) => e.type === 'COMMAND_REJECTED' && e.reason === 'card_silenced'),
    ).toBe(true);
    expect(r.state.cards[victim.cardId].usedAbilitiesThisTurn).toEqual([]);
  });
});

describe('silence (доп. покрытие, итерация 4.2)', () => {
  it('silenced-карта не реагирует триггером ON_THIS_DAMAGED', () => {
    let s = setup();
    const active = s.activePlayer;
    const opp = opponentOf(active);

    const caster = placeCard(s, active, 'silencer', 1);
    s = caster.state;
    const victim = placeCard(s, opp, 'victim', 2);
    s = victim.state;
    const attacker = placeCard(s, active, 'dummy', 2);
    s = attacker.state;

    s = castSilence(s, caster.cardId, victim.cardId).state;
    expect(s.cards[victim.cardId].silenced).toBe(true);

    s = { ...s, phase: 'COMBAT' };
    const before = s.cards[victim.cardId].damageTaken;
    const r = applyCommand(s, {
      type: 'ATTACK', playerId: active,
      attackerId: caster.cardId,
      target: { kind: 'CARD', cardId: victim.cardId },
    });
    const v = r.state.cards[victim.cardId];
    expect(v.damageTaken).toBe(before + 1);
  });

  it('незаглушённая карта с тем же триггером реагирует (контроль)', () => {
    let s = setup();
    const active = s.activePlayer;
    const opp = opponentOf(active);

    const attacker = placeCard(s, active, 'dummy', 3);
    s = attacker.state;
    const victim = placeCard(s, opp, 'victim', 5);
    s = victim.state;

    s = { ...s, phase: 'COMBAT' };
    const r = applyCommand(s, {
      type: 'ATTACK', playerId: active,
      attackerId: attacker.cardId,
      target: { kind: 'CARD', cardId: victim.cardId },
    });
    expect(r.state.cards[victim.cardId].damageTaken).toBe(2);
    expect(r.state.cards[victim.cardId].zone).toBe('FRONT');
  });
});
