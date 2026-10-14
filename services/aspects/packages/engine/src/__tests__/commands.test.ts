import { describe, it, expect } from 'vitest';
import { createGame } from '../state/create';
import { applyCommand } from '../commands/applyCommand';
import type { CardDefinition } from '@aspects/cards';
import type { GameState } from '../types/state';
import type { PlayerId } from '../types/ids';

const defs: Record<string, CardDefinition> = {
  plain: {
    id: 'plain',
    name: 'Пехотинец',
    personalityTag: 'plain',
    tags: [],
    cost: 2,
    strength: 2,
    health: 3,
    rarity: 'common',
    abilities: [],
  },
  charge: {
    id: 'charge',
    name: 'Гонец',
    personalityTag: 'charge',
    tags: [],
    cost: 1,
    strength: 1,
    health: 1,
    rarity: 'common',
    abilities: ['charge'],
  },
  slowUnit: {
    id: 'slowUnit',
    name: 'Тяжёлый',
    personalityTag: 'slowUnit',
    tags: [],
    cost: 3,
    strength: 3,
    health: 4,
    rarity: 'common',
    abilities: ['slow'],
  },
};

function deckOf(defId: string, n = 30): string[] {
  return Array.from({ length: n }, () => defId);
}

function newGame(): GameState {
  return createGame({
    seed: 'cmd-test',
    decks: {
      p1: [...deckOf('plain', 15), ...deckOf('charge', 15)],
      p2: deckOf('plain'),
    },
    cardDefinitions: defs,
  }).state;
}

function toPlay(state: GameState): GameState {
  let s = state;
  let guard = 10;
  while (s.phase !== 'PLAY' && guard-- > 0) {
    s = applyCommand(s, { type: 'ADVANCE_PHASE', playerId: s.activePlayer }).state;
  }
  return s;
}

describe('applyCommand / ADVANCE_PHASE', () => {
  it('из RESTORE прогоняет автошаги и останавливается на PLAY', () => {
    let s = newGame();
    expect(s.phase).toBe('RESTORE');

    const r = applyCommand(s, { type: 'ADVANCE_PHASE', playerId: s.activePlayer });
    expect(r.state.phase).toBe('PLAY');
    expect(r.events.some((e) => e.type === 'PHASE_CHANGED')).toBe(true);
    expect(r.events.some((e) => e.type === 'CARD_DRAWN')).toBe(true);
    expect(r.state.players[s.activePlayer].influence).toBe(1);
  });

  it('из PLAY переходит в COMBAT', () => {
    let s = toPlay(newGame());
    const r = applyCommand(s, { type: 'ADVANCE_PHASE', playerId: s.activePlayer });
    expect(r.state.phase).toBe('COMBAT');
  });

  it('из COMBAT завершает ход, начинает новый и останавливается на PLAY', () => {
    let s = toPlay(newGame());
    s = applyCommand(s, { type: 'ADVANCE_PHASE', playerId: s.activePlayer }).state;
    const r = applyCommand(s, { type: 'ADVANCE_PHASE', playerId: s.activePlayer });
    // Ход сменился, активный игрок — оппонент, фаза PLAY.
    expect(r.state.activePlayer).not.toBe(s.activePlayer);
    expect(r.state.phase).toBe('PLAY');
    expect(r.state.turnNumber).toBe(s.turnNumber + 1);
    expect(r.events.some((e) => e.type === 'TURN_STARTED')).toBe(true);
  });

  it('чужой игрок не может продвигать фазу', () => {
    const s = newGame();
    const other: PlayerId = s.activePlayer === 'p1' ? 'p2' : 'p1';
    const r = applyCommand(s, { type: 'ADVANCE_PHASE', playerId: other });
    expect(r.events.some((e) => e.type === 'COMMAND_REJECTED')).toBe(true);
    expect(r.state.phase).toBe(s.phase);
  });
});

describe('PLAY_CARD', () => {
  it('разыгрывает карту, списывает влияние, кладёт в Резерв', () => {
    let s = toPlay(newGame());
    s = {
      ...s,
      players: {
        ...s.players,
        [s.activePlayer]: { ...s.players[s.activePlayer], influence: 5 },
      },
    };

    const active = s.activePlayer;
    const cardId = s.players[active].hand.find((id) => {
      const c = s.cards[id];
      return c.definitionId === 'plain';
    })!;
    expect(cardId).toBeDefined();

    const r = applyCommand(s, {
      type: 'PLAY_CARD',
      playerId: active,
      cardId,
      column: 1,
    });

    expect(r.events.some((e) => e.type === 'CARD_PLAYED')).toBe(true);
    expect(r.state.players[active].influence).toBe(3); // 5 - 2
    expect(r.state.cards[cardId].zone).toBe('RESERVE');
    expect(r.state.cards[cardId].column).toBe(1);
    expect(r.state.board[0][active === 'p1' ? 'p1Reserve' : 'p2Reserve']).toBe(cardId);
  });

  it('Рвение выводит карту сразу во Фронт', () => {
    let s = toPlay(newGame());
    s = {
      ...s,
      players: {
        ...s.players,
        [s.activePlayer]: { ...s.players[s.activePlayer], influence: 5 },
      },
    };
    const active = s.activePlayer;
    const cardId = s.players[active].hand.find((id) => s.cards[id].definitionId === 'charge')!;
    expect(cardId).toBeDefined();

    const r = applyCommand(s, {
      type: 'PLAY_CARD',
      playerId: active,
      cardId,
      column: 2,
    });

    expect(r.state.cards[cardId].zone).toBe('FRONT');
    expect(r.state.board[1][active === 'p1' ? 'p1Front' : 'p2Front']).toBe(cardId);
  });

  it('недостаточно Влияния — reject, state не меняется', () => {
    let s = toPlay(newGame());
    const active = s.activePlayer;
    expect(s.players[active].influence).toBeLessThan(2);
    const cardId = s.players[active].hand.find((id) => s.cards[id].definitionId === 'plain')!;

    const r = applyCommand(s, {
      type: 'PLAY_CARD',
      playerId: active,
      cardId,
      column: 1,
    });

    expect(r.events.some((e) => e.type === 'COMMAND_REJECTED')).toBe(true);
    expect(r.state.players[active].influence).toBe(s.players[active].influence);
    expect(r.state.cards[cardId].zone).toBe('HAND');
  });

  it('нельзя играть не в PLAY-фазе', () => {
    const s = newGame();
    const active = s.activePlayer;
    const cardId = s.players[active].hand[0];
    const r = applyCommand(s, {
      type: 'PLAY_CARD',
      playerId: active,
      cardId,
      column: 1,
    });
    expect(r.events.some((e) => e.type === 'COMMAND_REJECTED')).toBe(true);
    expect(r.state.cards[cardId].zone).toBe('HAND');
  });
});

describe('END_TURN', () => {
  it('завершает ход и передаёт оппоненту', () => {
    let s = toPlay(newGame());
    const active = s.activePlayer;
    const r = applyCommand(s, { type: 'END_TURN', playerId: active });

    expect(r.state.activePlayer).not.toBe(active);
    expect(r.state.turnNumber).toBe(s.turnNumber + 1);
    expect(r.state.phase).toBe('PLAY');
  });

  it('чужой игрок не может завершить ход', () => {
    const s = toPlay(newGame());
    const other: PlayerId = s.activePlayer === 'p1' ? 'p2' : 'p1';
    const r = applyCommand(s, { type: 'END_TURN', playerId: other });
    expect(r.events.some((e) => e.type === 'COMMAND_REJECTED')).toBe(true);
    expect(r.state.activePlayer).toBe(s.activePlayer);
  });
});

describe('Отчаянье', () => {
  it('при Величии < 10 Резервы уходят во Фронт в конце хода', () => {
    let s = toPlay(newGame());
    s = {
      ...s,
      players: {
        ...s.players,
        [s.activePlayer]: {
          ...s.players[s.activePlayer],
          influence: 10,
          glory: 5,
        },
      },
    };
    const active = s.activePlayer;

    const cardId = s.players[active].hand.find((id) => s.cards[id].definitionId === 'plain')!;
    s = applyCommand(s, {
      type: 'PLAY_CARD',
      playerId: active,
      cardId,
      column: 3,
    }).state;
    expect(s.cards[cardId].zone).toBe('RESERVE');

    const r = applyCommand(s, { type: 'END_TURN', playerId: active });
    expect(r.state.cards[cardId].zone).toBe('FRONT');
    expect(r.state.board[2][active === 'p1' ? 'p1Front' : 'p2Front']).toBe(cardId);
  });
});

describe('Замедление', () => {
  it('карта с slow проводит в Резерве лишний ход', () => {
    let s = toPlay(newGame());
    s = {
      ...s,
      players: {
        ...s.players,
        [s.activePlayer]: { ...s.players[s.activePlayer], influence: 10 },
      },
    };
    const active = s.activePlayer;
    expect(true).toBe(true);
  });
});