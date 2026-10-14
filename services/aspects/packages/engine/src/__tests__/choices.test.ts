import { describe, it, expect } from 'vitest';
import { createGame } from '../state/create';
import { applyCommand } from '../commands/applyCommand';
import type { CardDefinition } from '@aspects/cards';
import type { GameState } from '../types/state';
import type { CardInstanceId, PlayerId } from '../types/ids';

const defs: Record<string, CardDefinition> = {
  plain: {
    id: 'plain', name: 'Пехотинец', personalityTag: 'plain', tags: [],
    cost: 1, strength: 2, health: 3, rarity: 'common',
    abilities: [], triggers: [],
  },
};

function deckOf(defId: string, n = 30): string[] {
  return Array.from({ length: n }, () => defId);
}

function toPlay(state: GameState): GameState {
  let s = state;
  let guard = 10;
  while (s.phase !== 'PLAY' && !s.pendingChoice && guard-- > 0) {
    s = applyCommand(s, { type: 'ADVANCE_PHASE', playerId: s.activePlayer }).state;
  }
  return s;
}

function withBigHand(size: number): GameState {
  let s = createGame({
    seed: 'choices',
    decks: { p1: deckOf('plain'), p2: deckOf('plain') },
    cardDefinitions: defs,
  }).state;

  s = toPlay(s);
  const active = s.activePlayer;
  const player = s.players[active];

  const need = size - player.hand.length;
  const moved = player.deck.slice(0, need);
  const newDeck = player.deck.slice(need);
  const newHand = [...player.hand, ...moved];

  return {
    ...s,
    cards: {
      ...s.cards,
      ...Object.fromEntries(moved.map((id) => [id, { ...s.cards[id], zone: 'HAND' as const, column: null }])),
    },
    players: {
      ...s.players,
      [active]: { ...player, hand: newHand, deck: newDeck },
    },
  };
}

describe('Ожидающий выбор: end-of-turn discard', () => {
  it('при руке ≤ 10 нет pendingChoice', () => {
    let s = toPlay(createGame({
      seed: 'small-hand',
      decks: { p1: deckOf('plain'), p2: deckOf('plain') },
      cardDefinitions: defs,
    }).state);
    const active = s.activePlayer;

    s = applyCommand(s, { type: 'ADVANCE_PHASE', playerId: active }).state;
    const r = applyCommand(s, { type: 'END_TURN', playerId: active });

    expect(r.state.pendingChoice).toBeNull();
    expect(r.state.activePlayer).not.toBe(active);
  });

  it('при руке > 10 устанавливается pendingChoice', () => {
    let s = withBigHand(13);
    const active = s.activePlayer;
    expect(s.players[active].hand.length).toBe(13);

    s = applyCommand(s, { type: 'ADVANCE_PHASE', playerId: active }).state;
    const r = applyCommand(s, { type: 'END_TURN', playerId: active });

    expect(r.state.pendingChoice).not.toBeNull();
    expect(r.state.pendingChoice!.kind).toBe('END_TURN_DISCARD');
    expect(r.state.pendingChoice!.playerId).toBe(active);
    expect(r.state.pendingChoice!.count).toBe(3);
    expect(r.state.pendingChoice!.eligibleCardIds.length).toBe(13);
    expect(r.events.some((e) => e.type === 'CHOICE_REQUESTED')).toBe(true);
  });

  it('RESOLVE_CHOICE переносит выбранные карты в сброс и завершает ход', () => {
    let s = withBigHand(12);
    const active = s.activePlayer;
    const discardIds = s.players[active].hand.slice(0, 2);

    s = applyCommand(s, { type: 'ADVANCE_PHASE', playerId: active }).state;
    s = applyCommand(s, { type: 'END_TURN', playerId: active }).state;

    expect(s.pendingChoice).not.toBeNull();
    const opponent = s.activePlayer === 'p1' ? 'p2' : 'p1';

    const r = applyCommand(s, {
      type: 'RESOLVE_CHOICE',
      playerId: active,
      cardIds: discardIds,
    });

    for (const id of discardIds) {
      expect(r.state.cards[id].zone).toBe('DISCARD');
    }
    expect(r.state.players[active].hand.length).toBe(10);
    expect(r.state.pendingChoice).toBeNull();
    expect(r.state.activePlayer).toBe(opponent);
    expect(r.events.some((e) => e.type === 'CHOICE_RESOLVED')).toBe(true);
  });

  it('другие команды отклоняются, пока есть pendingChoice', () => {
    let s = withBigHand(13);
    const active = s.activePlayer;
    s = applyCommand(s, { type: 'ADVANCE_PHASE', playerId: active }).state;
    s = applyCommand(s, { type: 'END_TURN', playerId: active }).state;

    expect(s.pendingChoice).not.toBeNull();

    const r = applyCommand(s, { type: 'END_TURN', playerId: active });
    expect(
      r.events.some((e) => e.type === 'COMMAND_REJECTED' && e.reason === 'awaiting_choice'),
    ).toBe(true);
  });

  it('RESOLVE_CHOICE с неверным количеством карт отклоняется', () => {
    let s = withBigHand(13);
    const active = s.activePlayer;
    s = applyCommand(s, { type: 'ADVANCE_PHASE', playerId: active }).state;
    s = applyCommand(s, { type: 'END_TURN', playerId: active }).state;

    const r = applyCommand(s, {
      type: 'RESOLVE_CHOICE',
      playerId: active,
      cardIds: s.players[active].hand.slice(0, 1), // нужно 3
    });
    expect(
      r.events.some((e) => e.type === 'COMMAND_REJECTED' && e.reason === 'wrong_card_count'),
    ).toBe(true);
  });

  it('RESOLVE_CHOICE с чужой картой отклоняется', () => {
    let s = withBigHand(13);
    const active = s.activePlayer;
    const opponent: PlayerId = active === 'p1' ? 'p2' : 'p1';
    s = applyCommand(s, { type: 'ADVANCE_PHASE', playerId: active }).state;
    s = applyCommand(s, { type: 'END_TURN', playerId: active }).state;

    const valid = s.players[active].hand.slice(0, 2);
    const foreign = s.players[opponent].hand[0];
    const r = applyCommand(s, {
      type: 'RESOLVE_CHOICE',
      playerId: active,
      cardIds: [...valid, foreign],
    });
    expect(
      r.events.some((e) => e.type === 'COMMAND_REJECTED' && e.reason === 'card_not_eligible'),
    ).toBe(true);
  });

  it('RESOLVE_CHOICE не от того игрока отклоняется', () => {
    let s = withBigHand(13);
    const active = s.activePlayer;
    const opponent: PlayerId = active === 'p1' ? 'p2' : 'p1';
    s = applyCommand(s, { type: 'ADVANCE_PHASE', playerId: active }).state;
    s = applyCommand(s, { type: 'END_TURN', playerId: active }).state;

    const r = applyCommand(s, {
      type: 'RESOLVE_CHOICE',
      playerId: opponent,
      cardIds: s.players[active].hand.slice(0, 3),
    });
    expect(
      r.events.some((e) => e.type === 'COMMAND_REJECTED' && e.reason === 'not_your_choice'),
    ).toBe(true);
  });

  it('RESOLVE_CHOICE с дубликатами отклоняется', () => {
    let s = withBigHand(13);
    const active = s.activePlayer;
    s = applyCommand(s, { type: 'ADVANCE_PHASE', playerId: active }).state;
    s = applyCommand(s, { type: 'END_TURN', playerId: active }).state;

    const dup = s.players[active].hand[0];
    const r = applyCommand(s, {
      type: 'RESOLVE_CHOICE',
      playerId: active,
      cardIds: [dup, dup, dup],
    });
    expect(
      r.events.some((e) => e.type === 'COMMAND_REJECTED' && e.reason === 'duplicate_cards'),
    ).toBe(true);
  });
});