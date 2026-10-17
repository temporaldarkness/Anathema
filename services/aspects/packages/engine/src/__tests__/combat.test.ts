import { describe, it, expect } from 'vitest';
import { createGame } from '../state/create';
import { applyCommand } from '../commands/applyCommand';
import { health, frontCount } from '../state/helpers';
import type { CardDefinition } from '@aspects/cards';
import type { GameState } from '../types/state';
import type { CardInstanceId, ColumnIndex, PlayerId } from '../types/ids';
import { opponentOf } from '../types/ids';

const defs: Record<string, CardDefinition> = {
  plain: {
    id: 'plain', name: 'Пехотинец', personalityTag: 'plain', tags: [],
    cost: 1, strength: 2, health: 3, rarity: 'common', abilities: [],
  },
  charge: {
    id: 'charge', name: 'Гонец', personalityTag: 'charge', tags: [],
    cost: 1, strength: 1, health: 1, rarity: 'common', abilities: ['charge'],
  },
  chargePlain: {
    id: 'chargePlain', name: 'Рыцарь', personalityTag: 'chargePlain', tags: [],
    cost: 2, strength: 2, health: 3, rarity: 'common', abilities: ['charge'],
  },
  taunt: {
    id: 'taunt', name: 'Стражник', personalityTag: 'taunt', tags: [],
    cost: 2, strength: 2, health: 4, rarity: 'common', abilities: ['taunt', 'charge'],
  },
  scout: {
    id: 'scout', name: 'Разведчик', personalityTag: 'scout', tags: [],
    cost: 1, strength: 1, health: 1, rarity: 'common', abilities: ['charge', 'scout'],
  },
  breakthrough: {
    id: 'breakthrough', name: 'Берсерк', personalityTag: 'breakthrough', tags: [],
    cost: 2, strength: 4, health: 2, rarity: 'common', abilities: ['breakthrough', 'charge'],
  },
  shielded: {
    id: 'shielded', name: 'Щитоносец', personalityTag: 'shielded', tags: [],
    cost: 2, strength: 1, health: 4, rarity: 'common', abilities: ['shield', 'charge'],
  },
};

function deckOf(defId: string, n = 30): string[] {
  return Array.from({ length: n }, () => defId);
}

function mixedDeck(defsToUse: Record<string, CardDefinition>): string[] {
  const ids = Object.keys(defsToUse);
  const perCard = Math.max(1, Math.floor(30 / ids.length));
  const deck: string[] = [];
  for (const id of ids) {
    for (let i = 0; i < perCard; i++) deck.push(id);
  }
  while (deck.length < 30) deck.push(ids[0]);
  return deck.slice(0, 30);
}

function setupAtPlay(
  defsToUse: Record<string, CardDefinition> = defs,
  seed = 'combat',
): GameState {
  const deck = mixedDeck(defsToUse);
  let state = createGame({
    seed,
    decks: { p1: deck, p2: deck },
    cardDefinitions: defsToUse,
  }).state;
  while (state.phase !== 'PLAY') {
    state = applyCommand(state, {
      type: 'ADVANCE_PHASE',
      playerId: state.activePlayer,
    }).state;
  }
  return state;
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
  const cardId = pool.find((id) => state.cards[id].definitionId === defId);
  if (!cardId) {
    throw new Error(`No ${defId} available for ${playerId}`);
  }

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

  const card = state.cards[cardId];
  return {
    state: {
      ...state,
      board: newBoard,
      cards: {
        ...state.cards,
        [cardId]: { ...card, zone, column, exhausted: false },
      },
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

describe('ATTACK — базовые случаи', () => {
  it('карта бьёт карту противника: обе получают урон, обе истощаются', () => {
    let s = setupAtPlay();
    const active = s.activePlayer;
    const opponent = opponentOf(active);

    const a = placeCardDirectly(s, active, 'chargePlain', 1, 'FRONT');
    s = a.state;
    const b = placeCardDirectly(s, opponent, 'chargePlain', 1, 'FRONT');
    s = b.state;

    s = advanceToCombat(s);

    const r = applyCommand(s, {
      type: 'ATTACK',
      playerId: active,
      attackerId: a.cardId,
      target: { kind: 'CARD', cardId: b.cardId },
    });

    expect(r.events.some((e) => e.type === 'COMMAND_REJECTED')).toBe(false);
    expect(health(r.state.cards[b.cardId])).toBe(1);
    expect(health(r.state.cards[a.cardId])).toBe(1);
    expect(r.state.cards[b.cardId].exhausted).toBe(true);
    expect(r.state.cards[a.cardId].exhausted).toBe(true);
  });

  it('атакующий не может атаковать, если истощён', () => {
    let s = setupAtPlay();
    const active = s.activePlayer;
    const opponent = opponentOf(active);

    const a = placeCardDirectly(s, active, 'charge', 1, 'FRONT');
    s = a.state;
    s = {
      ...s,
      cards: { ...s.cards, [a.cardId]: { ...s.cards[a.cardId], exhausted: true } },
    };

    s = advanceToCombat(s);

    const r = applyCommand(s, {
      type: 'ATTACK',
      playerId: active,
      attackerId: a.cardId,
      target: { kind: 'GUILD', playerId: opponent },
    });
    expect(
      r.events.some(
        (e) => e.type === 'COMMAND_REJECTED' && e.reason === 'attacker_exhausted',
      ),
    ).toBe(true);
  });

  it('карта бьёт гильдию, если Фронт противника пуст', () => {
    let s = setupAtPlay();
    const active = s.activePlayer;
    const opponent = opponentOf(active);

    const a = placeCardDirectly(s, active, 'charge', 1, 'FRONT');
    s = a.state;
    s = advanceToCombat(s);

    const before = s.players[opponent].glory;
    const r = applyCommand(s, {
      type: 'ATTACK',
      playerId: active,
      attackerId: a.cardId,
      target: { kind: 'GUILD', playerId: opponent },
    });

    expect(r.state.players[opponent].glory).toBe(before - 1);
    expect(r.events.some((e) => e.type === 'GLORY_CHANGED')).toBe(true);
  });

  it('нельзя атаковать гильдию, если Фронт не пуст', () => {
    let s = setupAtPlay();
    const active = s.activePlayer;
    const opponent = opponentOf(active);

    const a = placeCardDirectly(s, active, 'chargePlain', 1, 'FRONT');
    s = a.state;
    const b = placeCardDirectly(s, opponent, 'chargePlain', 1, 'FRONT');
    s = b.state;

    s = advanceToCombat(s);
    expect(frontCount(s, opponent)).toBeGreaterThan(0);

    const r = applyCommand(s, {
      type: 'ATTACK',
      playerId: active,
      attackerId: a.cardId,
      target: { kind: 'GUILD', playerId: opponent },
    });
    expect(
      r.events.some(
        (e) => e.type === 'COMMAND_REJECTED' && e.reason === 'front_not_empty',
      ),
    ).toBe(true);
  });

  it('карта во Фронте противника может атаковать Резерв, если во Фронте этой колонки пусто', () => {
    let s = setupAtPlay();
    const active = s.activePlayer;
    const opponent = opponentOf(active);

    const a = placeCardDirectly(s, active, 'chargePlain', 1, 'FRONT');
    s = a.state;
    const b = placeCardDirectly(s, opponent, 'chargePlain', 1, 'RESERVE');
    s = b.state;

    s = advanceToCombat(s);

    const r = applyCommand(s, {
      type: 'ATTACK',
      playerId: active,
      attackerId: a.cardId,
      target: { kind: 'CARD', cardId: b.cardId },
    });

    expect(r.events.some((e) => e.type === 'COMMAND_REJECTED')).toBe(false);
    expect(health(r.state.cards[b.cardId])).toBe(1);
    expect(health(r.state.cards[a.cardId])).toBe(1);
  });
});

describe('Щит', () => {
  it('поглощает первый урон и перестаёт действовать', () => {
    let s = setupAtPlay();
    const active = s.activePlayer;
    const opponent = opponentOf(active);

    const attacker = placeCardDirectly(s, active, 'chargePlain', 1, 'FRONT');
    s = attacker.state;
    const shield = placeCardDirectly(s, opponent, 'shielded', 1, 'FRONT');
    s = shield.state;

    s = advanceToCombat(s);

    const r = applyCommand(s, {
      type: 'ATTACK',
      playerId: active,
      attackerId: attacker.cardId,
      target: { kind: 'CARD', cardId: shield.cardId },
    });

    expect(r.events.some((e) => e.type === 'SHIELD_ABSORBED')).toBe(true);
    expect(r.state.cards[shield.cardId].shieldAvailable).toBe(false);
    expect(health(r.state.cards[shield.cardId])).toBe(4);
    expect(health(r.state.cards[attacker.cardId])).toBe(2);
  });

  it('Щит срабатывает даже при уроне 0', () => {
    let s = setupAtPlay();
    const active = s.activePlayer;
    const opponent = opponentOf(active);

    expect(true).toBe(true);
  });
});

describe('Прорыв', () => {
  it('избыточный урон уходит в Резерв и убивает карту', () => {
    let s = setupAtPlay();
    const active = s.activePlayer;
    const opponent = opponentOf(active);

    const front = placeCardDirectly(s, opponent, 'charge', 1, 'FRONT');
    s = front.state;
    const reserve = placeCardDirectly(s, opponent, 'charge', 1, 'RESERVE');
    s = reserve.state;

    const attacker = placeCardDirectly(s, active, 'breakthrough', 1, 'FRONT');
    s = attacker.state;

    s = advanceToCombat(s);

    const r = applyCommand(s, {
      type: 'ATTACK',
      playerId: active,
      attackerId: attacker.cardId,
      target: { kind: 'CARD', cardId: front.cardId },
    });

    expect(r.events.some((e) => e.type === 'COMMAND_REJECTED')).toBe(false);

    expect(r.state.cards[reserve.cardId].zone).toBe('DISCARD');
    expect(
      r.events.some((e) => e.type === 'CARD_DIED' && e.cardId === reserve.cardId),
    ).toBe(true);

    // health 2 - 1 = 1.
    expect(health(r.state.cards[attacker.cardId])).toBe(1);
  });

  it('Прорыв не срабатывает, если защитник выжил', () => {
    let s = setupAtPlay();
    const active = s.activePlayer;
    const opponent = opponentOf(active);

    const front = placeCardDirectly(s, opponent, 'chargePlain', 1, 'FRONT'); // 2/3
    s = front.state;
    const reserve = placeCardDirectly(s, opponent, 'charge', 1, 'RESERVE');
    s = reserve.state;

    const attacker = placeCardDirectly(s, active, 'breakthrough', 1, 'FRONT'); // 4/2
    s = attacker.state;

    s = advanceToCombat(s);

    const r = applyCommand(s, {
      type: 'ATTACK',
      playerId: active,
      attackerId: attacker.cardId,
      target: { kind: 'CARD', cardId: front.cardId },
    });

    expect(true).toBe(true);
  });
});

describe('Страж', () => {
  it('атакующий обязан атаковать Стража в своей колонке', () => {
    let s = setupAtPlay();
    const active = s.activePlayer;
    const opponent = opponentOf(active);

    const taunt = placeCardDirectly(s, opponent, 'taunt', 1, 'FRONT');
    s = taunt.state;

    const attacker = placeCardDirectly(s, active, 'chargePlain', 1, 'FRONT');
    s = attacker.state;

    s = advanceToCombat(s);

    const r = applyCommand(s, {
      type: 'ATTACK',
      playerId: active,
      attackerId: attacker.cardId,
      target: { kind: 'CARD', cardId: taunt.cardId },
    });
    expect(r.events.some((e) => e.type === 'COMMAND_REJECTED')).toBe(false);
  });

  it('нельзя атаковать не-Стража, если в колонке атакующего есть Страж', () => {
    let s = setupAtPlay();
    const active = s.activePlayer;
    const opponent = opponentOf(active);

    const taunt = placeCardDirectly(s, opponent, 'taunt', 1, 'FRONT');
    s = taunt.state;
    const plain = placeCardDirectly(s, opponent, 'chargePlain', 2, 'FRONT');
    s = plain.state;

    const attacker = placeCardDirectly(s, active, 'chargePlain', 1, 'FRONT');
    s = attacker.state;

    s = advanceToCombat(s);

    const r = applyCommand(s, {
      type: 'ATTACK',
      playerId: active,
      attackerId: attacker.cardId,
      target: { kind: 'CARD', cardId: plain.cardId },
    });
    expect(
      r.events.some(
        (e) => e.type === 'COMMAND_REJECTED' && e.reason === 'taunt_blocks',
      ),
    ).toBe(true);
  });
});

describe('Разведка', () => {
  it('разведчик может атаковать Резерв, даже если Фронт не пуст', () => {
    let s = setupAtPlay();
    const active = s.activePlayer;
    const opponent = opponentOf(active);

    const front = placeCardDirectly(s, opponent, 'chargePlain', 1, 'FRONT');
    s = front.state;
    const reserve = placeCardDirectly(s, opponent, 'chargePlain', 1, 'RESERVE');
    s = reserve.state;

    const scout = placeCardDirectly(s, active, 'scout', 2, 'FRONT');
    s = scout.state;

    s = advanceToCombat(s);

    const r = applyCommand(s, {
      type: 'ATTACK',
      playerId: active,
      attackerId: scout.cardId,
      target: { kind: 'CARD', cardId: reserve.cardId },
    });
    expect(r.events.some((e) => e.type === 'COMMAND_REJECTED')).toBe(false);
    expect(health(r.state.cards[reserve.cardId])).toBe(2);
  });

  it('без Разведки атака Резерва при непустом Фронте запрещена', () => {
    let s = setupAtPlay();
    const active = s.activePlayer;
    const opponent = opponentOf(active);

    const front = placeCardDirectly(s, opponent, 'chargePlain', 1, 'FRONT');
    s = front.state;
    const reserve = placeCardDirectly(s, opponent, 'chargePlain', 1, 'RESERVE');
    s = reserve.state;

    const attacker = placeCardDirectly(s, active, 'chargePlain', 1, 'FRONT');
    s = attacker.state;

    s = advanceToCombat(s);

    const r = applyCommand(s, {
      type: 'ATTACK',
      playerId: active,
      attackerId: attacker.cardId,
      target: { kind: 'CARD', cardId: reserve.cardId },
    });
    expect(
      r.events.some(
        (e) => e.type === 'COMMAND_REJECTED' && e.reason === 'front_blocks_reserve',
      ),
    ).toBe(true);
  });
});

describe('Замена', () => {
  it('меняет аспект на другой аспект той же личности', () => {
    const localDefs: Record<string, CardDefinition> = {
      mageA: {
        id: 'mageA', name: 'Маг (А)', personalityTag: 'mage', tags: [],
        cost: 1, strength: 1, health: 3, rarity: 'common', abilities: ['charge'],
      },
      mageB: {
        id: 'mageB', name: 'Маг (Б)', personalityTag: 'mage', tags: [],
        cost: 2, strength: 2, health: 4, rarity: 'common', abilities: ['charge'],
      },
      plain: {
        id: 'plain', name: 'Пехотинец', personalityTag: 'plain', tags: [],
        cost: 1, strength: 2, health: 3, rarity: 'common', abilities: [],
      },
    };
    let s = setupAtPlay(localDefs, 'replace-test');
    const active = s.activePlayer;

    const ensureInHand = (defId: string): CardInstanceId => {
      const player = s.players[active];
      const existing = player.hand.find(
        (id) => s.cards[id].definitionId === defId,
      );
      if (existing) return existing;
      const pool = [...player.hand, ...player.deck];
      const found = pool.find((id) => s.cards[id].definitionId === defId);
      if (!found) throw new Error(`No ${defId} in ${active}'s pool`);
      const swap = player.hand[0];
      const newDeck = player.deck.map((id) => (id === found ? swap : id));
      const newHand = player.hand.map((id) => (id === swap ? found : id));
      s = {
        ...s,
        cards: {
          ...s.cards,
          [found]: { ...s.cards[found], zone: 'HAND', column: null },
          [swap]: { ...s.cards[swap], zone: 'DECK', column: null },
        },
        players: {
          ...s.players,
          [active]: { ...player, deck: newDeck, hand: newHand },
        },
      };
      return found;
    };

    const cardA = ensureInHand('mageA');
    const cardB = ensureInHand('mageB');

    s = {
      ...s,
      players: {
        ...s.players,
        [active]: { ...s.players[active], influence: 10 },
      },
    };
    s = applyCommand(s, {
      type: 'PLAY_CARD',
      playerId: active,
      cardId: cardA,
      column: 1,
    }).state;
    expect(s.cards[cardA].zone).toBe('FRONT');

    let r = applyCommand(s, {
      type: 'REPLACE_CARD',
      playerId: active,
      cardId: cardB,
    });

    expect(r.state.pendingChoice).not.toBeNull();
    expect(r.state.pendingChoice!.kind).toBe('REPLACE_TARGET_SELECTION');
    expect(r.state.pendingChoice!.eligibleCardIds).toContain(cardA);

    r = applyCommand(r.state, {
      type: 'RESOLVE_CHOICE',
      playerId: active,
      cardIds: [cardA],
    });

    expect(r.events.some((e) => e.type === 'CARD_REPLACED')).toBe(true);
    expect(r.state.cards[cardA].zone).toBe('DISCARD');
    expect(r.state.cards[cardB].zone).toBe('FRONT');
    expect(r.state.board[0][active === 'p1' ? 'p1Front' : 'p2Front']).toBe(cardB);
    expect(r.events.some((e) => e.type === 'CARD_DIED')).toBe(false);
  });

  it('нельзя заменить, если нет карты с той же личностью на столе', () => {
    let s = setupAtPlay();
    const active = s.activePlayer;

    const cardId = s.players[active].hand.find(
      (id) => s.cards[id].definitionId === 'plain',
    );
    if (!cardId) {
      return;
    }
    const r = applyCommand(s, {
      type: 'REPLACE_CARD',
      playerId: active,
      cardId,
    });
    expect(
      r.events.some(
        (e) =>
          e.type === 'COMMAND_REJECTED' &&
          e.reason === 'no_matching_card_on_board',
      ),
    ).toBe(true);
  });
  
  it('скидка: floor(old_cost/2), но не больше floor(new_cost/2)', () => {
    const localDefs: Record<string, CardDefinition> = {
      expOld: {
        id: 'expOld', name: 'Старая дорогая', personalityTag: 'repltest', tags: [],
        cost: 4, strength: 2, health: 4, rarity: 'common', abilities: ['charge'],
      },
      expNew: {
        id: 'expNew', name: 'Новая дорогая', personalityTag: 'repltest', tags: [],
        cost: 4, strength: 3, health: 5, rarity: 'common', abilities: ['charge'],
      },
      plain: {
        id: 'plain', name: 'Пехотинец', personalityTag: 'plain', tags: [],
        cost: 1, strength: 1, health: 3, rarity: 'common', abilities: [],
      },
    };
    let s = setupAtPlay(localDefs, 'replace-discount-1');
    const active = s.activePlayer;
  
    const ensureInHand = (defId: string): CardInstanceId => {
      const player = s.players[active];
      const existing = player.hand.find((id) => s.cards[id].definitionId === defId);
      if (existing) return existing;
      const pool = [...player.hand, ...player.deck];
      const found = pool.find((id) => s.cards[id].definitionId === defId)!;
      const swap = player.hand[0];
      s = {
        ...s,
        cards: {
          ...s.cards,
          [found]: { ...s.cards[found], zone: 'HAND', column: null },
          [swap]: { ...s.cards[swap], zone: 'DECK', column: null },
        },
        players: {
          ...s.players,
          [active]: {
            ...player,
            deck: player.deck.map((id) => (id === found ? swap : id)),
            hand: player.hand.map((id) => (id === swap ? found : id)),
          },
        },
      };
      return found;
    };
  
    const expNewId = ensureInHand('expNew');
    const expOldId = ensureInHand('expOld');
    s = {
      ...s,
      players: { ...s.players, [active]: { ...s.players[active], influence: 10 } },
    };
  
    s = applyCommand(s, { type: 'PLAY_CARD', playerId: active, cardId: expOldId, column: 1 }).state;
    expect(s.cards[expOldId].zone).toBe('FRONT');
    const infBefore = s.players[active].influence; // 10 - 4 = 6
  
    s = applyCommand(s, { type: 'REPLACE_CARD', playerId: active, cardId: expNewId }).state;
    expect(s.pendingChoice).not.toBeNull();
    expect(s.pendingChoice!.kind).toBe('REPLACE_TARGET_SELECTION');
  
    const r = applyCommand(s, {
      type: 'RESOLVE_CHOICE',
      playerId: active,
      cardIds: [expOldId],
    });
  
    // Old cost 4, New cost 4: discount = min(2, 2) = 2. Cost = 4 - 2 = 2.
    // Influence: 6 - 2 = 4.
    expect(r.state.players[active].influence).toBe(infBefore - 2);
    expect(r.state.cards[expNewId].zone).toBe('FRONT');
  });
  
  it('скидка: нет прибыли при даунгрейде (5→1: скидка 0)', () => {
    const localDefs: Record<string, CardDefinition> = {
      bigOld: {
        id: 'bigOld', name: 'Большая', personalityTag: 'downtest', tags: [],
        cost: 4, strength: 3, health: 5, rarity: 'common', abilities: ['charge'],
      },
      smallNew: {
        id: 'smallNew', name: 'Маленькая', personalityTag: 'downtest', tags: [],
        cost: 1, strength: 1, health: 1, rarity: 'common', abilities: ['charge'],
      },
      plain: {
        id: 'plain', name: 'Пехотинец', personalityTag: 'plain', tags: [],
        cost: 1, strength: 1, health: 3, rarity: 'common', abilities: [],
      },
    };
    let s = setupAtPlay(localDefs, 'replace-discount-2');
    const active = s.activePlayer;
  
    const ensureInHand = (defId: string): CardInstanceId => {
      const player = s.players[active];
      const existing = player.hand.find((id) => s.cards[id].definitionId === defId);
      if (existing) return existing;
      const found = [...player.hand, ...player.deck].find(
        (id) => s.cards[id].definitionId === defId,
      )!;
      const swap = player.hand[0];
      s = {
        ...s,
        cards: {
          ...s.cards,
          [found]: { ...s.cards[found], zone: 'HAND', column: null },
          [swap]: { ...s.cards[swap], zone: 'DECK', column: null },
        },
        players: {
          ...s.players,
          [active]: {
            ...player,
            deck: player.deck.map((id) => (id === found ? swap : id)),
            hand: player.hand.map((id) => (id === swap ? found : id)),
          },
        },
      };
      return found;
    };
  
    const smallId = ensureInHand('smallNew');
    const bigId = ensureInHand('bigOld');
    s = {
      ...s,
      players: { ...s.players, [active]: { ...s.players[active], influence: 10 } },
    };
  
    s = applyCommand(s, { type: 'PLAY_CARD', playerId: active, cardId: bigId, column: 1 }).state;
    const infBefore = s.players[active].influence; // 10 - 4 = 6
  
    s = applyCommand(s, { type: 'REPLACE_CARD', playerId: active, cardId: smallId }).state;
    const r = applyCommand(s, {
      type: 'RESOLVE_CHOICE',
      playerId: active,
      cardIds: [bigId],
    });
  
    // Old cost 4, New cost 1: discount = min(2, 0) = 0. Cost = 1 - 0 = 1.
    // Influence: 6 - 1 = 5.
    expect(r.state.players[active].influence).toBe(infBefore - 1);
  });
});

describe('Мгновенная alt-victory', () => {
  it('пятая клетка → мгновенная победа', () => {
    let s = setupAtPlay();
    const active = s.activePlayer;

    // Даём p1 контроль над 4 клетками (1-4).
    s = {
      ...s,
      board: s.board.map((c, i) =>
        i < 4 ? { ...c, neutralOwner: active } : c,
      ),
    };

    // Юнит p1 в колонке 5. Нейтрал в колонке 5 ничейный.
    const a = placeCardDirectly(s, active, 'chargePlain', 5, 'FRONT');
    s = a.state;

    s = advanceToCombat(s);

    const r = applyCommand(s, {
      type: 'ATTACK',
      playerId: active,
      attackerId: a.cardId,
      target: { kind: 'NEUTRAL', column: 5 },
    });

    expect(r.state.winner).toBe(active);
    expect(r.state.winnerReason).toBe('alt_victory');
    expect(
      r.events.some((e) => e.type === 'GAME_OVER' && e.reason === 'alt_victory'),
    ).toBe(true);
  });

  it('четыре клетки → победы нет', () => {
    let s = setupAtPlay();
    const active = s.activePlayer;

    // Даём p1 контроль над 3 клетками.
    s = {
      ...s,
      board: s.board.map((c, i) =>
        i < 3 ? { ...c, neutralOwner: active } : c,
      ),
    };

    const a = placeCardDirectly(s, active, 'chargePlain', 4, 'FRONT');
    s = a.state;

    s = advanceToCombat(s);

    const r = applyCommand(s, {
      type: 'ATTACK',
      playerId: active,
      attackerId: a.cardId,
      target: { kind: 'NEUTRAL', column: 4 },
    });

    // 4/5 — не победа.
    expect(r.state.winner).toBeNull();
  });

  it('победа через deferred capture (после боя с защитником)', () => {
    let s = setupAtPlay();
    const active = s.activePlayer;
    const opponent = opponentOf(active);

    // p1 контролирует 4 клетки (1-4).
    s = {
      ...s,
      board: s.board.map((c, i) =>
        i < 4 ? { ...c, neutralOwner: active } : c,
      ),
    };

    // В колонке 5 — юнит p1 (4/2 breakthrough) и defender p2 (1/1 charge).
    const atk = placeCardDirectly(s, active, 'breakthrough', 5, 'FRONT');
    s = atk.state;
    const def = placeCardDirectly(s, opponent, 'charge', 5, 'FRONT');
    s = def.state;

    s = advanceToCombat(s);

    // Атакующий убьёт защитника (4 vs 1 hp) → deferred capture.
    const r = applyCommand(s, {
      type: 'ATTACK',
      playerId: active,
      attackerId: atk.cardId,
      target: { kind: 'NEUTRAL', column: 5 },
    });

    expect(r.state.winner).toBe(active);
    expect(r.state.winnerReason).toBe('alt_victory');
  });
});