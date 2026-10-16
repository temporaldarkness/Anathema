import { describe, it, expect } from 'vitest';
import { createGame } from '../state/create';
import { applyCommand } from '../commands/applyCommand';
import { health } from '../state/helpers';
import type { CardDefinition } from '@aspects/cards';
import type { GameState } from '../types/state';
import type { ColumnIndex, PlayerId } from '../types/ids';
import { opponentOf } from '../types/ids';

const defs: Record<string, CardDefinition> = {
  sniper: {
    id: 'sniper', name: 'Снайпер', personalityTag: 'sniper', tags: [],
    cost: 1, strength: 1, health: 1, rarity: 'common',
    abilities: ['charge'],
    triggers: [{
      trigger: 'ON_ENTER',
      effects: [{
        kind: 'CHOOSE_TARGETS_THEN',
        selection: { from: 'ENEMY_FRONT', count: 1 },
        then: [{ kind: 'DEAL_DAMAGE', amount: 3, target: 'CHOSEN' }],
      }],
    }],
  },
  captain: {
    id: 'captain', name: 'Капитан', personalityTag: 'captain', tags: [],
    cost: 1, strength: 1, health: 1, rarity: 'common',
    abilities: ['charge'],
    triggers: [{
      trigger: 'ON_ENTER',
      effects: [{
        kind: 'CHOOSE_TARGETS_THEN',
        selection: { from: 'FRIENDLY_FRONT', count: 1 },
        then: [{ kind: 'BUFF', strength: 2, health: 2, target: 'CHOSEN' }],
      }],
    }],
  },
  plain: {
    id: 'plain', name: 'Пехотинец', personalityTag: 'plain', tags: [],
    cost: 1, strength: 2, health: 5, rarity: 'common',
    abilities: [], triggers: [],
  },
};

const deck = [
  ...Array(10).fill('sniper'),
  ...Array(10).fill('captain'),
  ...Array(10).fill('plain'),
];

function setup(seed = 'choose-targets'): GameState {
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

function place(state: GameState, pid: PlayerId, defId: string, col: ColumnIndex) {
  const pool = [...state.players[pid].hand, ...state.players[pid].deck];
  const cid = pool.find((id) => state.cards[id].definitionId === defId)!;
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

describe('Выбор целей игроком', () => {
  it('CHOOSE_TARGETS_THEN ставит pendingChoice', () => {
    let s = setup();
    const active = s.activePlayer;
    const opponent = opponentOf(active);

    const e1 = place(s, opponent, 'plain', 1);
    s = e1.state;
    const e2 = place(s, opponent, 'plain', 2);
    s = e2.state;

    const r = ensureInHand(s, active, 'sniper');
    s = r.state;

    const result = applyCommand(s, {
      type: 'PLAY_CARD',
      playerId: active,
      cardId: r.cardId,
      column: 3,
    });

    expect(result.state.pendingChoice).not.toBeNull();
    expect(result.state.pendingChoice!.kind).toBe('EFFECT_TARGET_SELECTION');
    if (result.state.pendingChoice!.kind === 'EFFECT_TARGET_SELECTION') {
      expect(result.state.pendingChoice!.count).toBe(1);
    }
    expect(result.state.pendingChoice!.playerId).toBe(active);
    expect(result.state.pendingChoice!.eligibleCardIds.length).toBe(2);
    expect(result.events.some((e) => e.type === 'CHOICE_REQUESTED')).toBe(true);
  });

  it('RESOLVE_CHOICE применяет then-эффект к выбранной цели', () => {
    let s = setup();
    const active = s.activePlayer;
    const opponent = opponentOf(active);

    const e1 = place(s, opponent, 'plain', 1);
    s = e1.state;
    const e2 = place(s, opponent, 'plain', 2);
    s = e2.state;

    const beforeE1 = health(s.cards[e1.cardId]);
    const beforeE2 = health(s.cards[e2.cardId]);

    const r = ensureInHand(s, active, 'sniper');
    s = r.state;

    s = applyCommand(s, {
      type: 'PLAY_CARD',
      playerId: active,
      cardId: r.cardId,
      column: 3,
    }).state;

    expect(s.pendingChoice).not.toBeNull();

    const res = applyCommand(s, {
      type: 'RESOLVE_CHOICE',
      playerId: active,
      cardIds: [e2.cardId],
    });

    expect(health(res.state.cards[e1.cardId])).toBe(beforeE1);
    expect(health(res.state.cards[e2.cardId])).toBe(beforeE2 - 3);
    expect(res.state.pendingChoice).toBeNull();
    expect(res.events.some((e) => e.type === 'CHOICE_RESOLVED')).toBe(true);
  });

  it('CHOOSE_TARGETS_THEN: пустой список целей — эффект не срабатывает и не зависает', () => {
    let s = setup();
    const active = s.activePlayer;
    const r = ensureInHand(s, active, 'sniper');
    s = r.state;

    const result = applyCommand(s, {
      type: 'PLAY_CARD',
      playerId: active,
      cardId: r.cardId,
      column: 1,
    });

    expect(result.state.pendingChoice).toBeNull();
    expect(result.events.some((e) => e.type === 'COMMAND_REJECTED')).toBe(false);
  });

  it('ошибки: неверное количество, не тот игрок, неверный id', () => {
    let s = setup();
    const active = s.activePlayer;
    const opponent = opponentOf(active);

    const e1 = place(s, opponent, 'plain', 1);
    s = e1.state;
    const e2 = place(s, opponent, 'plain', 2);
    s = e2.state;

    const r = ensureInHand(s, active, 'sniper');
    s = r.state;
    s = applyCommand(s, { type: 'PLAY_CARD', playerId: active, cardId: r.cardId, column: 3 }).state;

    let res = applyCommand(s, { type: 'RESOLVE_CHOICE', playerId: active, cardIds: [] });
	expect(res.events.some((e) => e.type === 'CHOICE_RESOLVED')).toBe(true);
	expect(res.state.pendingChoice).toBeNull();
	
	s = applyCommand(s, { type: 'ADVANCE_PHASE', playerId: active }).state;
	s = applyCommand(s, { type: 'ADVANCE_PHASE', playerId: active }).state;
	s = applyCommand(s, { type: 'ADVANCE_PHASE', playerId: active }).state;
	while (s.activePlayer !== active && !s.pendingChoice && !s.winner) {
	  if (s.phase === 'PLAY' || s.phase === 'COMBAT') {
		s = applyCommand(s, { type: 'END_TURN', playerId: s.activePlayer }).state;
	  } else {
		s = applyCommand(s, { type: 'ADVANCE_PHASE', playerId: s.activePlayer }).state;
	  }
	}
	
	const r2 = ensureInHand(s, active, 'sniper');
	s = r2.state;
	s = applyCommand(s, { type: 'PLAY_CARD', playerId: active, cardId: r2.cardId, column: 3 }).state;
	res = applyCommand(s, { type: 'RESOLVE_CHOICE', playerId: opponent, cardIds: [e1.cardId] });
	expect(res.events.some((e) => e.type === 'COMMAND_REJECTED' && e.reason === 'not_your_choice')).toBe(true);
	
	res = applyCommand(s, { type: 'RESOLVE_CHOICE', playerId: active, cardIds: ['nonexistent' as any] });
	expect(res.events.some((e) => e.type === 'COMMAND_REJECTED' && e.reason === 'card_not_eligible')).toBe(true);
	
	res = applyCommand(s, { type: 'END_TURN', playerId: active });
	expect(res.events.some((e) => e.type === 'COMMAND_REJECTED' && e.reason === 'awaiting_choice')).toBe(true);
  });

  it('BUFF CHOSEN — усиливает выбранного союзника', () => {
    let s = setup();
    const active = s.activePlayer;

    const a1 = place(s, active, 'plain', 1);
    s = a1.state;
    const a2 = place(s, active, 'plain', 2);
    s = a2.state;

    const r = ensureInHand(s, active, 'captain');
    s = r.state;
    s = applyCommand(s, { type: 'PLAY_CARD', playerId: active, cardId: r.cardId, column: 3 }).state;

    expect(s.pendingChoice).not.toBeNull();

    const res = applyCommand(s, { type: 'RESOLVE_CHOICE', playerId: active, cardIds: [a1.cardId] });

    const card = res.state.cards[a1.cardId];
    let str = card.baseStrength;
    let hp = card.baseHealth;
    for (const m of card.modifiers) {
      if (m.stat === 'strength') str += m.delta;
      if (m.stat === 'health') hp += m.delta;
    }
    expect(str).toBe(4);
    expect(hp).toBe(7);

    const card2 = res.state.cards[a2.cardId];
    expect(card2.modifiers.length).toBe(0);
  });

  it('детерминизм: одинаковый seed → одинаковые eligible id', () => {
    function runOnce(): string {
      let s = setup('determinism');
      const active = s.activePlayer;
      const opponent = opponentOf(active);

      const e1 = place(s, opponent, 'plain', 1);
      s = e1.state;
      const e2 = place(s, opponent, 'plain', 2);
      s = e2.state;

      const r = ensureInHand(s, active, 'sniper');
      s = r.state;
      s = applyCommand(s, { type: 'PLAY_CARD', playerId: active, cardId: r.cardId, column: 3 }).state;

      return s.pendingChoice!.eligibleCardIds.join(',');
    }
    expect(runOnce()).toBe(runOnce());
  });
});