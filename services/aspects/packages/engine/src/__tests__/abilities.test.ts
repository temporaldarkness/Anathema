import { describe, it, expect } from 'vitest';
import { createGame } from '../state/create';
import { applyCommand } from '../commands/applyCommand';
import { health, strength } from '../state/helpers';
import type { CardDefinition } from '@aspects/cards';
import type { GameState } from '../types/state';
import type { CardInstanceId, ColumnIndex, PlayerId } from '../types/ids';
import { opponentOf } from '../types/ids';

const defs: Record<string, CardDefinition> = {
  plain: {
    id: 'plain', name: 'Пехотинец', personalityTag: 'plain', tags: [],
    cost: 1, strength: 2, health: 3, rarity: 'common',
    abilities: [], triggers: [],
  },
  firestarter: {
    id: 'firestarter', name: 'Поджигатель', personalityTag: 'firestarter', tags: [],
    cost: 3, strength: 2, health: 2, rarity: 'common',
    abilities: ['charge'],
    triggers: [
      { trigger: 'ON_ENTER', effects: [{ kind: 'DEAL_DAMAGE', amount: 1, target: 'ALL_ENEMY_FRONT' }] },
    ],
  },
  scholar: {
    id: 'scholar', name: 'Учёный', personalityTag: 'scholar', tags: [],
    cost: 2, strength: 1, health: 3, rarity: 'common',
    abilities: [],
    triggers: [
      { trigger: 'ON_ENTER', effects: [{ kind: 'DRAW', count: 1, who: 'SELF' }] },
    ],
  },
  captain: {
    id: 'captain', name: 'Капитан', personalityTag: 'captain', tags: [],
    cost: 3, strength: 2, health: 4, rarity: 'common',
    abilities: [],
    triggers: [
      { trigger: 'ON_REINFORCE', effects: [{ kind: 'BUFF', strength: 1, health: 1, target: 'ALL_FRIENDLY_FRONT' }] },
    ],
  },
  martyr: {
    id: 'martyr', name: 'Мученик', personalityTag: 'martyr', tags: [],
    cost: 2, strength: 1, health: 1, rarity: 'common',
    abilities: ['charge'],
    triggers: [
      { trigger: 'ON_EXIT', effects: [{ kind: 'HEAL_GLORY', amount: 2, who: 'SELF' }] },
    ],
  },
};

function deckOf(defId: string, n = 30): string[] {
  return Array.from({ length: n }, () => defId);
}

function mixedDeck(defsToUse: Record<string, CardDefinition>): string[] {
  const ids = Object.keys(defsToUse);
  const perCard = Math.max(1, Math.floor(30 / ids.length));
  const deck: string[] = [];
  for (const id of ids) for (let i = 0; i < perCard; i++) deck.push(id);
  while (deck.length < 30) deck.push(ids[0]);
  return deck.slice(0, 30);
}

function setupAtPlay(
  defsToUse: Record<string, CardDefinition> = defs,
  seed = 'abilities',
): GameState {
  const deck = mixedDeck(defsToUse);
  let s = createGame({
    seed,
    decks: { p1: deck, p2: deck },
    cardDefinitions: defsToUse,
  }).state;
  while (s.phase !== 'PLAY') {
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

function ensureInHand(state: GameState, playerId: PlayerId, defId: string): {
  state: GameState;
  cardId: CardInstanceId;
} {
  const player = state.players[playerId];
  const existing = player.hand.find((id) => state.cards[id].definitionId === defId);
  if (existing) return { state, cardId: existing };

  const pool = [...player.hand, ...player.deck];
  const found = pool.find((id) => state.cards[id].definitionId === defId);
  if (!found) throw new Error(`No ${defId} available for ${playerId}`);

  const swap = player.hand[0];
  const newDeck = player.deck.map((id) => (id === found ? swap : id));
  const newHand = player.hand.map((id) => (id === swap ? found : id));
  return {
    state: {
      ...state,
      cards: {
        ...state.cards,
        [found]: { ...state.cards[found], zone: 'HAND', column: null },
        [swap]: { ...state.cards[swap], zone: 'DECK', column: null },
      },
      players: {
        ...state.players,
        [playerId]: { ...player, deck: newDeck, hand: newHand },
      },
    },
    cardId: found,
  };
}

function placeCardDirectly(
  state: GameState,
  playerId: PlayerId,
  defId: string,
  column: ColumnIndex,
  zone: 'FRONT' | 'RESERVE' = 'FRONT',
): { state: GameState; cardId: CardInstanceId } {
  const player = state.players[playerId];
  const pool = [...player.hand, ...player.deck];
  const cardId = pool.find((id) => state.cards[id].definitionId === defId)!;
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
      cards: { ...state.cards, [cardId]: { ...state.cards[cardId], zone, column } },
      players: {
        ...state.players,
        [playerId]: { ...player, hand: newHand, deck: newDeck },
      },
    },
    cardId,
  };
}

function advanceToCombat(state: GameState): GameState {
  let s = state;
  while (s.phase !== 'COMBAT') {
    s = applyCommand(s, { type: 'ADVANCE_PHASE', playerId: s.activePlayer }).state;
  }
  return s;
}

describe('ON_ENTER', () => {
  it('срабатывает при розыгрыше из руки: DRAW', () => {
    let s = setupAtPlay();
    const active = s.activePlayer;
    const before = s.players[active].hand.length;

    const r = ensureInHand(s, active, 'scholar');
    s = r.state;
    const playResult = applyCommand(s, {
      type: 'PLAY_CARD',
      playerId: active,
      cardId: r.cardId,
      column: 1,
    });

    expect(playResult.events.some((e) => e.type === 'COMMAND_REJECTED')).toBe(false);
    expect(playResult.state.players[active].hand.length).toBe(before);
  });

  it('срабатывает при розыгрыше: DEAL_DAMAGE ALL_ENEMY_FRONT', () => {
    let s = setupAtPlay();
    const active = s.activePlayer;
    const opponent = opponentOf(active);

    const enemy = placeCardDirectly(s, opponent, 'plain', 1, 'FRONT');
    s = enemy.state;

    const r = ensureInHand(s, active, 'firestarter');
    s = r.state;
    const beforeHp = health(s.cards[enemy.cardId]);

    const playResult = applyCommand(s, {
      type: 'PLAY_CARD',
      playerId: active,
      cardId: r.cardId,
      column: 2,
    });

    expect(playResult.events.some((e) => e.type === 'COMMAND_REJECTED')).toBe(false);
    expect(health(playResult.state.cards[enemy.cardId])).toBe(beforeHp - 1);
  });

  it('НЕ срабатывает при замене', () => {
    const localDefs: Record<string, CardDefinition> = {
      mageA: {
        id: 'mageA', name: 'Маг A', personalityTag: 'mage', tags: [],
        cost: 1, strength: 1, health: 3, rarity: 'common',
        abilities: ['charge'], triggers: [],
      },
      mageB: {
        id: 'mageB', name: 'Маг B', personalityTag: 'mage', tags: [],
        cost: 2, strength: 2, health: 4, rarity: 'common',
        abilities: ['charge'],
        triggers: [{ trigger: 'ON_ENTER', effects: [{ kind: 'DRAW', count: 1, who: 'SELF' }] }],
      },
    };
    let s = setupAtPlay(localDefs, 'enter-no-replace');
    const active = s.activePlayer;

    const a = ensureInHand(s, active, 'mageA');
    s = a.state;
    s = applyCommand(s, { type: 'PLAY_CARD', playerId: active, cardId: a.cardId, column: 1 }).state;

    const b = ensureInHand(s, active, 'mageB');
    s = b.state;
    const handBefore = s.players[active].hand.length;

    const r = applyCommand(s, { type: 'REPLACE_CARD', playerId: active, cardId: b.cardId });
    expect(r.state.players[active].hand.length).toBe(handBefore - 1);
  });
});

describe('ON_REINFORCE', () => {
  it('срабатывает при переходе Резерв→Фронт в начале хода', () => {
    let s = setupAtPlay();
    const active = s.activePlayer;

    const cap = placeCardDirectly(s, active, 'captain', 3, 'RESERVE');
    s = cap.state;

    const ally = placeCardDirectly(s, active, 'plain', 1, 'FRONT');
    s = ally.state;

    const beforeStr = strength(s.cards[ally.cardId]);
    expect(s.cards[cap.cardId].zone).toBe('RESERVE');

    s = advanceToCombat(s);
    s = applyCommand(s, { type: 'END_TURN', playerId: s.activePlayer }).state;

    while (s.activePlayer !== active) {
      if (s.phase === 'PLAY' || s.phase === 'COMBAT') {
        s = applyCommand(s, { type: 'END_TURN', playerId: s.activePlayer }).state;
      } else {
        s = applyCommand(s, { type: 'ADVANCE_PHASE', playerId: s.activePlayer }).state;
      }
      if (s.winner) break;
    }

    expect(s.cards[cap.cardId].zone).toBe('FRONT');
    expect(strength(s.cards[ally.cardId])).toBe(beforeStr + 1);
  });
});

describe('ON_EXIT', () => {
  it('срабатывает при уходе карты в сброс', () => {
    let s = setupAtPlay();
    const active = s.activePlayer;
    const opponent = opponentOf(active);

    const martyr = placeCardDirectly(s, active, 'martyr', 1, 'FRONT');
    s = martyr.state;
    const attacker = placeCardDirectly(s, opponent, 'plain', 1, 'FRONT');
    s = attacker.state;

    while (s.activePlayer !== opponent) {
      if (s.phase === 'PLAY' || s.phase === 'COMBAT') {
        s = applyCommand(s, { type: 'END_TURN', playerId: s.activePlayer }).state;
      } else {
        s = applyCommand(s, { type: 'ADVANCE_PHASE', playerId: s.activePlayer }).state;
      }
    }
    s = advanceToCombat(s);

    const r = applyCommand(s, {
      type: 'ATTACK',
      playerId: opponent,
      attackerId: attacker.cardId,
      target: { kind: 'CARD', cardId: martyr.cardId },
    });

    expect(r.events.some((e) => e.type === 'CARD_DIED' && e.cardId === martyr.cardId)).toBe(true);
    expect(r.state.cards[martyr.cardId].zone).toBe('DISCARD');
  });
});

describe('BUFF', () => {
  it('применяется как модификатор', () => {
    let s = setupAtPlay();
    const active = s.activePlayer;
    const a = placeCardDirectly(s, active, 'plain', 1, 'FRONT');
    s = a.state;
    s = {
      ...s,
      cards: {
        ...s.cards,
        [a.cardId]: {
          ...s.cards[a.cardId],
          modifiers: [{ source: 'test', stat: 'strength', delta: 3 }],
        },
      },
    };
    expect(strength(s.cards[a.cardId])).toBe(5);
  });
});

describe('Цепные реакции', () => {
  it('death одного существа порождает цепь смертей через ON_EXIT других', () => {
    const localDefs: Record<string, CardDefinition> = {
      strong: {
        id: 'strong', name: 'Сильный', personalityTag: 'strong', tags: [],
        cost: 1, strength: 1, health: 1, rarity: 'common',
        abilities: ['charge'],
        triggers: [{
          trigger: 'ON_EXIT',
          effects: [{ kind: 'DEAL_DAMAGE', amount: 3, target: 'ALL_ENEMY_FRONT' }],
        }],
      },
      weak: {
        id: 'weak', name: 'Слабый', personalityTag: 'weak', tags: [],
        cost: 1, strength: 1, health: 1, rarity: 'common',
        abilities: ['charge'],
        triggers: [{
          trigger: 'ON_EXIT',
          effects: [{ kind: 'DEAL_DAMAGE', amount: 1, target: 'ALL_ENEMY_FRONT' }],
        }],
      },
    };

    const deck = [...Array(15).fill('strong'), ...Array(15).fill('weak')];

    let s = createGame({
      seed: 'chain-reaction',
      decks: { p1: deck, p2: deck },
      cardDefinitions: localDefs,
    }).state;
    while (s.phase !== 'PLAY') {
      s = applyCommand(s, { type: 'ADVANCE_PHASE', playerId: s.activePlayer }).state;
    }

    const active = s.activePlayer;
    const opponent = opponentOf(active);

    const place = (state: GameState, pid: PlayerId, defId: string, col: ColumnIndex) => {
      const pool = [...state.players[pid].hand, ...state.players[pid].deck];
      const cid = pool.find((id) => state.cards[id].definitionId === defId);
      if (!cid) throw new Error(`No ${defId} found for ${pid}`);
      const nb = state.board.map((c) => ({ ...c }));
      const targetCol = nb[col - 1];
      if (pid === 'p1') targetCol.p1Front = cid;
      else targetCol.p2Front = cid;
      return {
        state: {
          ...state,
          board: nb,
          cards: {
            ...state.cards,
            [cid]: { ...state.cards[cid], zone: 'FRONT' as const, column: col },
          },
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
    };

    const a1 = place(s, active, 'strong', 1);
    s = a1.state;
    const a2 = place(s, active, 'weak', 2);
    s = a2.state;

    const b1 = place(s, opponent, 'strong', 1);
    s = b1.state;
    const b2 = place(s, opponent, 'weak', 2);
    s = b2.state;

    s = advanceToCombat(s);

    const r = applyCommand(s, {
      type: 'ATTACK',
      playerId: active,
      attackerId: a1.cardId,
      target: { kind: 'CARD', cardId: b1.cardId },
    });

    expect(r.events.some((e) => e.type === 'COMMAND_REJECTED')).toBe(false);
    expect(
      r.events.some((e) => e.type === 'COMMAND_REJECTED' && e.reason === 'trigger_loop_limit'),
    ).toBe(false);

    expect(r.state.cards[a1.cardId].zone).toBe('DISCARD');
    expect(r.state.cards[a2.cardId].zone).toBe('DISCARD');
    expect(r.state.cards[b1.cardId].zone).toBe('DISCARD');
    expect(r.state.cards[b2.cardId].zone).toBe('DISCARD');

    const diedEvents = r.events.filter((e) => e.type === 'CARD_DIED');
    expect(diedEvents.length).toBeGreaterThanOrEqual(4);
  });

  it('loop safety: триггер, ссылающийся на уже мёртвую карту, не срабатывает', () => {
    const localDefs: Record<string, CardDefinition> = {
      a: {
        id: 'a', name: 'A', personalityTag: 'a', tags: [],
        cost: 1, strength: 1, health: 1, rarity: 'common',
        abilities: ['charge'],
        triggers: [{
          trigger: 'ON_EXIT',
          effects: [{ kind: 'DEAL_DAMAGE', amount: 5, target: 'ALL_ENEMY_FRONT' }],
        }],
      },
      b: {
        id: 'b', name: 'B', personalityTag: 'b', tags: [],
        cost: 1, strength: 1, health: 1, rarity: 'common',
        abilities: ['charge'],
        triggers: [{
          trigger: 'ON_EXIT',
          effects: [{ kind: 'DEAL_DAMAGE', amount: 5, target: 'ALL_ENEMY_FRONT' }],
        }],
      },
      killer: {
        id: 'killer', name: 'Убийца', personalityTag: 'killer', tags: [],
        cost: 1, strength: 5, health: 5, rarity: 'common',
        abilities: ['charge'], triggers: [],
      },
    };

    const deck = [
      ...Array(10).fill('a'),
      ...Array(10).fill('b'),
      ...Array(10).fill('killer'),
    ];

    let s = createGame({
      seed: 'loop-safety',
      decks: { p1: deck, p2: deck },
      cardDefinitions: localDefs,
    }).state;
    while (s.phase !== 'PLAY') {
      s = applyCommand(s, { type: 'ADVANCE_PHASE', playerId: s.activePlayer }).state;
    }
    const active = s.activePlayer;
    const opponent = opponentOf(active);

    const place = (state: GameState, pid: PlayerId, defId: string, col: ColumnIndex) => {
      const pool = [...state.players[pid].hand, ...state.players[pid].deck];
      const cid = pool.find((id) => state.cards[id].definitionId === defId);
      if (!cid) throw new Error(`No ${defId} found for ${pid}`);
      const nb = state.board.map((c) => ({ ...c }));
      const targetCol = nb[col - 1];
      if (pid === 'p1') targetCol.p1Front = cid;
      else targetCol.p2Front = cid;
      return {
        state: {
          ...state,
          board: nb,
          cards: {
            ...state.cards,
            [cid]: { ...state.cards[cid], zone: 'FRONT' as const, column: col },
          },
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
    };

    const k = place(s, active, 'killer', 1);
    s = k.state;
    const a1 = place(s, opponent, 'a', 1);
    s = a1.state;

    s = advanceToCombat(s);

    const r = applyCommand(s, {
      type: 'ATTACK',
      playerId: active,
      attackerId: k.cardId,
      target: { kind: 'CARD', cardId: a1.cardId },
    });

    expect(
      r.events.some((e) => e.type === 'COMMAND_REJECTED' && e.reason === 'trigger_loop_limit'),
    ).toBe(false);

    expect(r.state.cards[a1.cardId].zone).toBe('DISCARD');
    expect(r.state.cards[k.cardId].zone).toBe('DISCARD');
  });
});