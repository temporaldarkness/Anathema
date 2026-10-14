import { describe, it, expect } from 'vitest';
import { createGame } from '../state/create';
import { applyCommand } from '../commands/applyCommand';
import { health, frontCount } from '../state/helpers';
import type { CardDefinition } from '@aspects/cards';
import type { GameState } from '../types/state';
import type { ColumnIndex, PlayerId } from '../types/ids';
import { opponentOf } from '../types/ids';

const defs: Record<string, CardDefinition> = {
  bouncer: {
    id: 'bouncer', name: 'Бросок', personalityTag: 'bouncer', tags: [],
    cost: 2, strength: 2, health: 2, rarity: 'common',
    abilities: ['charge'],
    triggers: [{
      id: 'bounce',
      trigger: 'ON_ENTER',
      effects: [{
        kind: 'CHOOSE_TARGETS_THEN',
        selection: { from: 'ENEMY_FRONT', count: 1 },
        then: [{ kind: 'RETURN_TO_HAND', target: 'CHOSEN' }],
      }],
    }],
    activatedAbilities: [],
  } as any,

  mover: {
    id: 'mover', name: 'Ходок', personalityTag: 'mover', tags: [],
    cost: 1, strength: 1, health: 1, rarity: 'common',
    abilities: ['charge'],
    triggers: [{
      id: 'shift',
      trigger: 'ON_TURN_START',
      oncePerTurn: true,
      effects: [{ kind: 'MOVE_CARD', target: 'SELF', to: 'RANDOM_OWN_EMPTY' }],
    }],
    activatedAbilities: [],
  } as any,

  rezzer: {
    id: 'rezzer', name: 'Восстановитель', personalityTag: 'rezzer', tags: [],
    cost: 1, strength: 1, health: 1, rarity: 'common',
    abilities: ['charge'],
    triggers: [{
      id: 'raise',
      trigger: 'ON_ENTER',
      effects: [{ kind: 'RETURN_FROM_DISCARD', count: 1, who: 'SELF', destination: 'HAND' }],
    }],
    activatedAbilities: [],
  } as any,

  discarding: {
    id: 'discarding', name: 'Изгоняющий', personalityTag: 'discarding', tags: [],
    cost: 1, strength: 1, health: 1, rarity: 'common',
    abilities: ['charge'],
    triggers: [{
      id: 'rip',
      trigger: 'ON_ENTER',
      effects: [{ kind: 'DISCARD_RANDOM', count: 2, who: 'OPPONENT' }],
    }],
    activatedAbilities: [],
  } as any,

  tempGhost: {
    id: 'tempGhost', name: 'Призрак', personalityTag: 'tempGhost', tags: [],
    cost: 1, strength: 2, health: 2, rarity: 'common',
    abilities: ['charge', 'temporary'],
    triggers: [],
    activatedAbilities: [],
    tempDuration: 1,
  } as any,

  plain: {
    id: 'plain', name: 'Простой', personalityTag: 'plain', tags: [],
    cost: 1, strength: 1, health: 3, rarity: 'common',
    abilities: [],
    triggers: [],
    activatedAbilities: [],
  } as any,
};

const deck = [
  ...Array(5).fill('bouncer'),
  ...Array(5).fill('mover'),
  ...Array(5).fill('rezzer'),
  ...Array(5).fill('discarding'),
  ...Array(5).fill('tempGhost'),
  ...Array(5).fill('plain'),
];

function setup(seed = 'new-fx'): GameState {
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

function place(state: GameState, pid: PlayerId, defId: string, col: ColumnIndex, zone: 'FRONT'|'RESERVE' = 'FRONT') {
  const pool = [...state.players[pid].hand, ...state.players[pid].deck];
  const cid = pool.find((id) => state.cards[id].definitionId === defId)!;
  const nb = state.board.map((c) => ({ ...c }));
  const tc = nb[col - 1];
  if (pid === 'p1') { if (zone === 'FRONT') tc.p1Front = cid; else tc.p1Reserve = cid; }
  else { if (zone === 'FRONT') tc.p2Front = cid; else tc.p2Reserve = cid; }
  return {
    state: {
      ...state,
      board: nb,
      cards: { ...state.cards, [cid]: { ...state.cards[cid], zone, column: col } },
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

describe('RETURN_TO_HAND', () => {
  it('возвращает карту с поля в руку владельца', () => {
    let s = setup();
    const active = s.activePlayer;
    const opp = opponentOf(active);
    const e1 = place(s, opp, 'plain', 1);
    s = e1.state;

    const r = ensureInHand(s, active, 'bouncer');
    s = r.state;
    s = applyCommand(s, { type: 'PLAY_CARD', playerId: active, cardId: r.cardId, column: 2 }).state;

    expect(s.pendingChoice).not.toBeNull();

    const res = applyCommand(s, {
      type: 'RESOLVE_CHOICE',
      playerId: active,
      cardIds: [e1.cardId],
    });
    expect(res.state.cards[e1.cardId].zone).toBe('HAND');
    expect(res.state.players[opp].hand).toContain(e1.cardId);
  });
});

describe('RETURN_FROM_DISCARD', () => {
  it('возвращает карту из сброса в руку', () => {
    let s = setup();
    const active = s.activePlayer;
    const p = s.players[active];
    const cardId = p.deck[0];
    const newDeck = p.deck.slice(1);
    const newDiscard = [...p.discard, cardId];
    s = {
      ...s,
      cards: { ...s.cards, [cardId]: { ...s.cards[cardId], zone: 'DISCARD' } },
      players: {
        ...s.players,
        [active]: { ...p, deck: newDeck, discard: newDiscard },
      },
    };

    const r = ensureInHand(s, active, 'rezzer');
    s = r.state;
    const handBefore = s.players[active].hand.length;

    const res = applyCommand(s, { type: 'PLAY_CARD', playerId: active, cardId: r.cardId, column: 1 });
    expect(res.events.some((e) => e.type === 'COMMAND_REJECTED')).toBe(false);
    expect(res.state.players[active].hand.length).toBe(handBefore);
  });
});

describe('DISCARD_RANDOM', () => {
  it('сбрасывает N карт у противника', () => {
    let s = setup();
    const active = s.activePlayer;
    const opp = opponentOf(active);
    const handBefore = s.players[opp].hand.length;

    const r = ensureInHand(s, active, 'discarding');
    s = r.state;
    const res = applyCommand(s, { type: 'PLAY_CARD', playerId: active, cardId: r.cardId, column: 1 });
    expect(res.state.players[opp].hand.length).toBe(handBefore - 2);
  });
});

describe('MOVE_CARD', () => {
  it('перемещает карту в свободную колонку', () => {
    let s = setup();
    const active = s.activePlayer;

    const m = place(s, active, 'mover', 1, 'FRONT');
    s = m.state;
    expect(s.cards[m.cardId].column).toBe(1);

    s = applyCommand(s, { type: 'END_TURN', playerId: active }).state;
    const opp = opponentOf(active);
    while (s.activePlayer !== active && !s.pendingChoice && !s.winner) {
      if (s.phase === 'PLAY' || s.phase === 'COMBAT') {
        s = applyCommand(s, { type: 'END_TURN', playerId: s.activePlayer }).state;
      } else {
        s = applyCommand(s, { type: 'ADVANCE_PHASE', playerId: s.activePlayer }).state;
      }
    }

    expect(s.cards[m.cardId].column).not.toBe(1);
    expect(s.cards[m.cardId].column).not.toBeNull();
  });
});

describe('TEMPORARY', () => {
  it('карта исчезает в конце хода владельца', () => {
    let s = setup();
    const active = s.activePlayer;
    const r = ensureInHand(s, active, 'tempGhost');
    s = r.state;

    s = applyCommand(s, {
      type: 'PLAY_CARD',
      playerId: active,
      cardId: r.cardId,
      column: 1,
    }).state;
    expect(s.cards[r.cardId].zone).toBe('FRONT');

    s = applyCommand(s, { type: 'END_TURN', playerId: active }).state;

    expect(s.cards[r.cardId].zone).toBe('DISCARD');
  });

  it('карта с tempDuration:2 живёт два хода', () => {
    let s = setup();
    const active = s.activePlayer;

    const pool = [...s.players[active].hand, ...s.players[active].deck];
    const cid = pool.find((id) => s.cards[id].definitionId === 'tempGhost')!;
    s = {
      ...s,
      cards: { ...s.cards, [cid]: { ...s.cards[cid], tempTurnsLeft: 2 } },
    };

    expect(s.cards[cid].tempTurnsLeft).toBe(2);
  });
});

describe('Фикс мгновенного выхода', () => {
  it('карта в Резерве, положенная в этом ходу, не выходит при смерти соседа', () => {
    let s = setup();
    const active = s.activePlayer;
    const opp = opponentOf(active);

    const front = place(s, opp, 'plain', 1, 'FRONT');
    s = front.state;

    const r = ensureInHand(s, active, 'plain');
    s = r.state;
    s = applyCommand(s, {
      type: 'PLAY_CARD',
      playerId: active,
      cardId: r.cardId,
      column: 1,
    }).state;
    expect(s.cards[r.cardId].zone).toBe('RESERVE');
    expect(s.cards[r.cardId].readyForFront).toBe(false);

    while (s.phase !== 'COMBAT' && !s.pendingChoice) {
      s = applyCommand(s, { type: 'ADVANCE_PHASE', playerId: s.activePlayer }).state;
    }

    s = applyCommand(s, { type: 'END_TURN', playerId: active }).state;

    expect(s.cards[r.cardId].zone).toBe('RESERVE');
  });

  it('карта в Резерве противника не выходит во время нашего хода', () => {
    let s = setup();
    const active = s.activePlayer;
    const opp = opponentOf(active);

    const reserveCard = place(s, opp, 'plain', 2, 'RESERVE');
    s = reserveCard.state;
    expect(s.cards[reserveCard.cardId].zone).toBe('RESERVE');
    expect(s.cards[reserveCard.cardId].readyForFront).toBe(false);

    while (s.phase !== 'COMBAT' && !s.pendingChoice) {
      s = applyCommand(s, { type: 'ADVANCE_PHASE', playerId: s.activePlayer }).state;
    }

    expect(s.cards[reserveCard.cardId].zone).toBe('RESERVE');
  });
});