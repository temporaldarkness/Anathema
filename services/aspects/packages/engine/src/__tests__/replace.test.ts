import { describe, it, expect } from 'vitest';
import { createGame } from '../state/create';
import { applyCommand } from '../commands/applyCommand';
import type { CardDefinition } from '@aspects/cards';
import type { GameState } from '../types/state';
import type { CardInstanceId, ColumnIndex, PlayerId } from '../types/ids';

const defs: Record<string, CardDefinition> = {};
for (const cost of [1, 2, 3, 4, 5]) {
  defs[`p${cost}`] = {
    id: `p${cost}`, name: `Личность ${cost}`, personalityTag: 'shared', tags: [],
    cost, strength: 1, health: 3, rarity: 'common',
    abilities: [], triggers: [], activatedAbilities: [],
  } as any;
}
defs.locked = {
  id: 'locked', name: 'Незаменяемый', personalityTag: 'shared', tags: [],
  cost: 3, strength: 1, health: 3, rarity: 'common',
  abilities: [], triggers: [], activatedAbilities: [],
  cantBeReplaced: true,
} as any;

const deck = [
  ...Array(12).fill('p3'),
  ...Array(6).fill('p5'),
  ...Array(6).fill('p1'),
  ...Array(6).fill('locked'),
];

function setup(seed = 'replace'): GameState {
  let s = createGame({
    seed,
    decks: { p1: deck, p2: deck },
    cardDefinitions: defs,
  }).state;
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

function placeOnBoard(state: GameState, defId: string, column: ColumnIndex) {
  const pid = state.activePlayer;
  const pool = [...state.players[pid].hand, ...state.players[pid].deck];
  const boardIds = new Set(
    state.board.flatMap((c) => [c.p1Front, c.p1Reserve, c.p2Front, c.p2Reserve]),
  );
  let cardId: CardInstanceId | undefined = pool.find(
    (id) => state.cards[id].definitionId === defId && !boardIds.has(id),
  );

  const nb = state.board.map((c) => ({ ...c }));

  let cards = state.cards;
  let hand = state.players[pid].hand;
  let deckArr = state.players[pid].deck;

  if (!cardId) {
    cardId = `t_${defId}_${column}` as CardInstanceId;
    const def = state.definitions[defId];
    cards = {
      ...cards,
      [cardId]: {
        instanceId: cardId,
        definitionId: defId,
        ownerId: pid,
        controllerId: pid,
        zone: 'FRONT' as const,
        column,
        baseStrength: def.strength,
        baseHealth: def.health,
        damageTaken: 0,
        modifiers: [],
        silenced: false,
        exhausted: false,
        attacksThisTurn: 0,
        usedAbilitiesThisTurn: [],
        summoningSick: true,
        keywordsGranted: [],
      } as any,
    };
  } else {
    hand = hand.filter((i) => i !== cardId);
    deckArr = deckArr.filter((i) => i !== cardId);
  }

  const targetCol = nb[column - 1];
  if (pid === 'p1') targetCol.p1Front = cardId;
  else targetCol.p2Front = cardId;

  return {
    state: {
      ...state,
      board: nb,
      cards: { ...cards, [cardId]: { ...cards[cardId], zone: 'FRONT' as const, column } },
      players: {
        ...state.players,
        [pid]: { ...state.players[pid], hand, deck: deckArr },
      },
    },
    cardId,
  };
}

function ensureHandCard(state: GameState, defId: string) {
  const pid = state.activePlayer as PlayerId;
  const existing = state.players[pid].hand.find(
    (cid) => state.cards[cid].definitionId === defId,
  );
  if (existing) return { state, cardId: existing };

  const cardId = `h_${defId}_${Object.keys(state.cards).length}` as CardInstanceId;
  const def = state.definitions[defId];
  if (!def) throw new Error(`Unknown def ${defId}`);
  const instance = {
    instanceId: cardId,
    definitionId: defId,
    ownerId: pid,
    controllerId: pid,
    zone: 'HAND' as const,
    column: null,
    baseStrength: def.strength,
    baseHealth: def.health,
    damageTaken: 0,
    modifiers: [],
    silenced: false,
    exhausted: false,
    attacksThisTurn: 0,
    usedAbilitiesThisTurn: [],
    summoningSick: true,
    keywordsGranted: [],
  } as any;
  return {
    state: {
      ...state,
      cards: { ...state.cards, [cardId]: instance },
      players: {
        ...state.players,
        [pid]: {
          ...state.players[pid],
          hand: [...state.players[pid].hand, cardId],
        },
      },
    },
    cardId,
  };
}

/** Выполняет REPLACE_CARD + RESOLVE_CHOICE на единственную цель. */
function doReplace(state: GameState, newCardId: CardInstanceId) {
  const r1 = applyCommand(state, {
    type: 'REPLACE_CARD',
    playerId: state.activePlayer,
    cardId: newCardId,
  });
  const pending = r1.state.pendingChoice;
  if (!pending || pending.kind !== 'REPLACE_TARGET_SELECTION') {
    return { state: r1.state, events: r1.events, failed: true as const };
  }
  const targetCardId = pending.eligibleCardIds[0];
  const r2 = applyCommand(r1.state, {
    type: 'RESOLVE_CHOICE',
    playerId: state.activePlayer,
    cardIds: [targetCardId],
  });
  return {
    state: r2.state,
    events: [...r1.events, ...r2.events],
    targetCardId,
    failed: false as const,
  };
}

describe('скидка замены (v0.3)', () => {
  it('замена 3→3 стоит 2 влияния (скидка 1)', () => {
    let s = setup();
    const b = placeOnBoard(s, 'p3', 1);
    s = b.state;
    const infBefore = s.players[s.activePlayer].influence;
    const hc = ensureHandCard(s, 'p3');
    s = hc.state;
    const newId = hc.cardId;

    const r = doReplace(s, newId);
    expect(r.failed).toBe(false);
    expect(infBefore - r.state.players[r.state.activePlayer].influence).toBe(2);
  });

  it('замена 5→5 стоит 3 влияния (скидка 2)', () => {
    let s = setup();
    const b = placeOnBoard(s, 'p5', 1);
    s = b.state;
    const infBefore = s.players[s.activePlayer].influence;
    const hc = ensureHandCard(s, 'p5');
    s = hc.state;
    const newId = hc.cardId;

    const r = doReplace(s, newId);
    expect(r.failed).toBe(false);
    expect(infBefore - r.state.players[r.state.activePlayer].influence).toBe(3);
  });

  it('замена 5→1 стоит 1 влияние (даунгрейд без скидки)', () => {
    let s = setup();
    const b = placeOnBoard(s, 'p5', 1);
    s = b.state;
    const infBefore = s.players[s.activePlayer].influence;
    const hc = ensureHandCard(s, 'p1');
    s = hc.state;
    const newId = hc.cardId;

    const r = doReplace(s, newId);
    expect(r.failed).toBe(false);
    expect(infBefore - r.state.players[r.state.activePlayer].influence).toBe(1);
  });

  it('cantBeReplaced блокирует замену', () => {
    let s = setup();
    const b = placeOnBoard(s, 'locked', 1);
    s = b.state;
    const hc = ensureHandCard(s, 'p3');
    s = hc.state;
    const newId = hc.cardId;

    const r = applyCommand(s, {
      type: 'REPLACE_CARD',
      playerId: s.activePlayer,
      cardId: newId,
    });
    expect(r.state.pendingChoice).toBeNull();
    expect(
      r.events.some(
        (e) => e.type === 'COMMAND_REJECTED' && e.reason === 'no_matching_card_on_board',
      ),
    ).toBe(true);
  });

  it('бонус колонки 1 складывается со скидкой (3→3: 3-1-1=1)', () => {
    let s = setup();
    const active = s.activePlayer;
    const nb = s.board.map((c, i) =>
      i === 0 ? { ...c, neutralOwner: active as PlayerId } : c,
    );
    s = { ...s, board: nb };

    const b = placeOnBoard(s, 'p3', 2);
    s = b.state;
    const infBefore = s.players[s.activePlayer].influence;
    const hc = ensureHandCard(s, 'p3');
    s = hc.state;
    const newId = hc.cardId;

    const r = doReplace(s, newId);
    expect(r.failed).toBe(false);
    expect(infBefore - r.state.players[r.state.activePlayer].influence).toBe(1);
  });
});
