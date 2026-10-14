import { describe, it, expect } from 'vitest';
import { createGame } from '../state/create';
import { applyCommand } from '../commands/applyCommand';
import type { CardDefinition } from '@aspects/cards';
import type { GameState } from '../types/state';
import type { ColumnIndex, PlayerId } from '../types/ids';
import { opponentOf } from '../types/ids';

const defs: Record<string, CardDefinition> = {
  medic: {
    id: 'medic', name: 'Медик', personalityTag: 'medic', tags: [],
    cost: 1, strength: 1, health: 2, rarity: 'common',
    abilities: ['charge'],
    triggers: [{
      trigger: 'ON_ENTER',
      effects: [{ kind: 'HEAL_GLORY', amount: 5, who: 'SELF' }],
    }],
  },
  plain: {
    id: 'plain', name: 'Пехотинец', personalityTag: 'plain', tags: [],
    cost: 1, strength: 2, health: 3, rarity: 'common',
    abilities: [], triggers: [],
  },
};

const deck = [...Array(15).fill('medic'), ...Array(15).fill('plain')];

function setupAtPlay(): GameState {
  let s = createGame({
    seed: 'heal-glory',
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

describe('HEAL_GLORY', () => {
  it('восстанавливает Величие игрока', () => {
    let s = setupAtPlay();
    const active = s.activePlayer;

    s = {
      ...s,
      players: {
        ...s.players,
        [active]: { ...s.players[active], glory: 20 },
      },
    };

    const cardId = s.players[active].hand.find(
      (id) => s.cards[id].definitionId === 'medic',
    )!;
    const r = applyCommand(s, {
      type: 'PLAY_CARD',
      playerId: active,
      cardId,
      column: 1,
    });

    expect(r.events.some((e) => e.type === 'COMMAND_REJECTED')).toBe(false);
    expect(r.state.players[active].glory).toBe(25);
  });

  it('не превышает cap 30', () => {
    let s = setupAtPlay();
    const active = s.activePlayer;

    s = {
      ...s,
      players: {
        ...s.players,
        [active]: { ...s.players[active], glory: 28 },
      },
    };

    const cardId = s.players[active].hand.find(
      (id) => s.cards[id].definitionId === 'medic',
    )!;
    const r = applyCommand(s, {
      type: 'PLAY_CARD',
      playerId: active,
      cardId,
      column: 1,
    });

    expect(r.state.players[active].glory).toBe(30);
  });
});