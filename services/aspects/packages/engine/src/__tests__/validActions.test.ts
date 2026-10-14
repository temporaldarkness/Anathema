import { describe, it, expect } from 'vitest';
import { createGame } from '../state/create';
import { applyCommand } from '../commands/applyCommand';
import { getValidActions } from '../state/validActions';
import type { CardDefinition } from '@aspects/cards';
import type { GameState } from '../types/state';
import type { PlayerId } from '../types/ids';
import { previewCardAttack, getValidAttackTargets } from '../state/preview';

const defs: Record<string, CardDefinition> = {
  plain: {
    id: 'plain', name: 'Простой', personalityTag: 'plain', tags: [],
    cost: 1, strength: 1, health: 3, rarity: 'common',
    abilities: [], triggers: [], activatedAbilities: [],
  } as any,
};

function setup(): GameState {
  let s = createGame({
    seed: 'valid-actions',
    decks: {
      p1: Array(30).fill('plain'),
      p2: Array(30).fill('plain'),
    },
    cardDefinitions: defs,
    useMulligan: false,
  }).state;
  while (s.phase !== 'PLAY') {
    s = applyCommand(s, { type: 'ADVANCE_PHASE', playerId: s.activePlayer }).state;
  }
  return s;
}

describe('getValidActions', () => {
  it('возвращает команды только для активного игрока', () => {
    const s = setup();
    const active = s.activePlayer;
    const other: PlayerId = active === 'p1' ? 'p2' : 'p1';

    const forActive = getValidActions(s, active);
    const forOther = getValidActions(s, other);

    expect(forActive.length).toBeGreaterThan(0);
    expect(forOther.length).toBe(0);
  });

  it('в фазе PLAY содержит PLAY_CARD для доступных карт', () => {
    let s = setup();
    const active = s.activePlayer;
    s = {
      ...s,
      players: {
        ...s.players,
        [active]: { ...s.players[active], influence: 10 },
      },
    };

    const actions = getValidActions(s, active);
    const plays = actions.filter((a) => a.type === 'PLAY_CARD');
    expect(plays.length).toBeGreaterThan(0);
  });

  it('каждая возвращённая команда НЕ отклоняется движком', () => {
    let s = setup();
    const active = s.activePlayer;
    s = {
      ...s,
      players: {
        ...s.players,
        [active]: { ...s.players[active], influence: 10 },
      },
    };

    const actions = getValidActions(s, active);
    for (const cmd of actions.slice(0, 3)) {
      const r = applyCommand(s, cmd);
      const rejected = r.events.some((e) => e.type === 'COMMAND_REJECTED');
      expect(rejected).toBe(false);
    }
  });

  it('после победы возвращает пустой список', () => {
    const s = setup();
    const dead: GameState = { ...s, winner: 'p1', winnerReason: 'test' };
    expect(getValidActions(dead, 'p1')).toEqual([]);
    expect(getValidActions(dead, 'p2')).toEqual([]);
  });
});

describe('previewCardAttack', () => {
  it('возвращает null для несуществующих карт', () => {
    const s = setup();
    expect(previewCardAttack(s, 'nope' as any, 'nope2' as any)).toBeNull();
  });
});