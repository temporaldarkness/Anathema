import { describe, it, expect } from 'vitest';
import { createGame } from '../state/create';
import { applyCommand } from '../commands/applyCommand';
import type { CardDefinition } from '@aspects/cards';
import type { GameState } from '../types/state';
import type { ColumnIndex, PlayerId } from '../types/ids';
import { opponentOf } from '../types/ids';

const defs: Record<string, CardDefinition> = {
  handSummoner: {
    id: 'handSummoner', name: 'Сборщик', personalityTag: 'hs', tags: [],
    cost: 1, strength: 1, health: 2, rarity: 'common',
    abilities: ['charge'],
    triggers: [{
      id: 'gift',
      trigger: 'ON_ENTER',
      effects: [{ kind: 'SUMMON', defId: 'tk_wisp', count: 2, who: 'SELF', destination: 'HAND' }],
    }],
    activatedAbilities: [],
  } as any,

  reserveSummoner: {
    id: 'reserveSummoner', name: 'Запасной', personalityTag: 'rs', tags: [],
    cost: 1, strength: 1, health: 2, rarity: 'common',
    abilities: [],
    triggers: [{
      id: 'stash',
      trigger: 'ON_ENTER',
      effects: [{ kind: 'SUMMON', defId: 'tk_wisp', count: 1, who: 'SELF', destination: 'RESERVE' }],
    }],
    activatedAbilities: [],
  } as any,
  
  parasite: {
    id: 'parasite', name: 'Паразит', personalityTag: 'parasite', tags: [],
    cost: 1, strength: 1, health: 2, rarity: 'common',
    abilities: ['charge'],
    triggers: [{
      id: 'infest',
      trigger: 'ON_ENTER',
      effects: [{ kind: 'SUMMON', defId: 'tk_larva', count: 1, who: 'SELF', destination: 'FRONT' }],
    }],
    activatedAbilities: [],
  } as any,

  adult: {
    id: 'adult', name: 'Взрослый симбиот', personalityTag: 'symbiote', tags: [],
    cost: 1, strength: 3, health: 3, rarity: 'common',
    abilities: [],
    triggers: [],
    activatedAbilities: [],
  } as any,

  parasite2: {
    id: 'parasite2', name: 'Паразит 2', personalityTag: 'parasite2', tags: [],
    cost: 1, strength: 1, health: 2, rarity: 'common',
    abilities: ['charge'],
    triggers: [{
      id: 'infest',
      trigger: 'ON_ENTER',
      effects: [{ kind: 'SUMMON', defId: 'tk_larva', count: 1, who: 'SELF', destination: 'FRONT' }],
    }],
    activatedAbilities: [],
  } as any,

  plain: {
    id: 'plain', name: 'Простой', personalityTag: 'plain', tags: [],
    cost: 1, strength: 1, health: 3, rarity: 'common',
    abilities: [],
    triggers: [],
    activatedAbilities: [],
  } as any,

  tk_wisp: {
    id: 'tk_wisp', name: 'Огонёк', personalityTag: 'tk_wisp', tags: [],
    cost: 0, strength: 1, health: 1, rarity: 'common',
    abilities: ['charge'],
    triggers: [],
    activatedAbilities: [],
    isToken: true,
  } as any,

  tk_larva: {
    id: 'tk_larva', name: 'Личинка', personalityTag: 'symbiote', tags: [],
    cost: 0, strength: 1, health: 1, rarity: 'common',
    abilities: [],
    triggers: [],
    activatedAbilities: [],
    isToken: true,
    sharesIdentity: true,
  } as any,
};

const deck = [
  ...Array(5).fill('handSummoner'),
  ...Array(5).fill('reserveSummoner'),
  ...Array(5).fill('parasite'),
  ...Array(5).fill('parasite2'),
  ...Array(5).fill('adult'),
  ...Array(5).fill('plain'),
];

function setup(seed = 'summon-dest'): GameState {
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

describe('SUMMON destination', () => {
  it('HAND: токен уходит в руку', () => {
    let s = setup();
    const active = s.activePlayer;
    const r = ensureInHand(s, active, 'handSummoner');
    s = r.state;
    const handBefore = s.players[active].hand.length;

    const res = applyCommand(s, {
      type: 'PLAY_CARD',
      playerId: active,
      cardId: r.cardId,
      column: 1,
    });

    expect(res.events.some((e) => e.type === 'COMMAND_REJECTED')).toBe(false);
    expect(res.state.players[active].hand.length).toBe(handBefore + 1);
    const wispInHand = res.state.players[active].hand
      .map((id) => res.state.cards[id])
      .filter((c) => c.definitionId === 'tk_wisp');
    expect(wispInHand.length).toBe(2);
    expect(wispInHand[0].isToken).toBe(true);
    const evs = res.events.filter((e) => e.type === 'TOKEN_SUMMONED');
    expect(evs.length).toBe(2);
    expect((evs[0] as any).destination).toBe('HAND');
  });

  it('RESERVE: токен уходит в резерв', () => {
    let s = setup();
    const active = s.activePlayer;
    const r = ensureInHand(s, active, 'reserveSummoner');
    s = r.state;

    const res = applyCommand(s, {
      type: 'PLAY_CARD',
      playerId: active,
      cardId: r.cardId,
      column: 1,
    });

    const tokens = Object.values(res.state.cards)
      .filter((c) => c.isToken && c.ownerId === active);
    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens[0].zone).toBe('RESERVE');
  });
});

describe('sharesIdentity', () => {
  it('токен с sharesIdentity блокирует обычную карту той же личности', () => {
    let s = setup();
    const active = s.activePlayer;

    const p = ensureInHand(s, active, 'parasite');
    s = p.state;
    s = applyCommand(s, {
      type: 'PLAY_CARD',
      playerId: active,
      cardId: p.cardId,
      column: 1,
    }).state;

    const larva = Object.values(s.cards).find(
      (c) => c.definitionId === 'tk_larva' && c.ownerId === active,
    );
    expect(larva).toBeDefined();
    expect(larva!.sharesIdentity).toBe(true);

    const a = ensureInHand(s, active, 'adult');
    s = a.state;
    const res = applyCommand(s, {
      type: 'PLAY_CARD',
      playerId: active,
      cardId: a.cardId,
      column: 2,
    });
    expect(
      res.events.some((e) => e.type === 'COMMAND_REJECTED' && e.reason === 'duplicate_personality'),
    ).toBe(true);
  });

  it('токен с sharesIdentity не призывается дважды', () => {
    let s = setup();
    const active = s.activePlayer;

    const p1 = ensureInHand(s, active, 'parasite');
    s = p1.state;
    s = applyCommand(s, {
      type: 'PLAY_CARD',
      playerId: active,
      cardId: p1.cardId,
      column: 1,
    }).state;

    const p2 = ensureInHand(s, active, 'parasite2');
    s = p2.state;
    const res = applyCommand(s, {
      type: 'PLAY_CARD',
      playerId: active,
      cardId: p2.cardId,
      column: 2,
    });

    const lost = res.events.filter(
      (e) => e.type === 'TOKEN_LOST' && e.defId === 'tk_larva',
    );
    expect(lost.length).toBe(1);
    expect((lost[0] as any).reason).toBe('personality_conflict');

    const larvae = Object.values(res.state.cards).filter(
      (c) => c.definitionId === 'tk_larva' && c.ownerId === active,
    );
    expect(larvae.length).toBe(1);
  });

  it('токен с sharesIdentity можно заменить обычной картой той же личности', () => {
    let s = setup();
    const active = s.activePlayer;

    const p = ensureInHand(s, active, 'parasite');
    s = p.state;
    s = applyCommand(s, {
      type: 'PLAY_CARD',
      playerId: active,
      cardId: p.cardId,
      column: 1,
    }).state;

    const larva = Object.values(s.cards).find(
      (c) => c.definitionId === 'tk_larva' && c.ownerId === active,
    )!;

    const a = ensureInHand(s, active, 'adult');
    s = a.state;

    const res = applyCommand(s, {
      type: 'REPLACE_CARD',
      playerId: active,
      cardId: a.cardId,
    });

    expect(res.events.some((e) => e.type === 'COMMAND_REJECTED')).toBe(false);
    expect(res.state.cards[a.cardId].zone).toBe('FRONT');
    expect(res.state.cards[a.cardId].column).toBe(larva.column);
    expect(res.state.cards[larva.instanceId].zone).toBe('DISCARD');
    expect(res.state.players[active].discard.includes(larva.instanceId)).toBe(false);
  });
});