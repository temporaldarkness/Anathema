import { describe, it, expect } from 'vitest';
import { createGame, applyCommand } from '@aspects/engine';
import type { GameState, PlayerId } from '@aspects/engine';
import { getPack, getDecks } from '@aspects/cards';
import { GreedyBot } from '../greedy';
import { HeuristicBot } from '../heuristic';
import { pickResponder } from '../responder';
import type { Bot } from '../types';

// ───────────────────────────── helpers ──────────────────────────────

function newGame(seed: string, useMulligan = false): GameState {
  const pack = getPack('azeroth');
  const decks = getDecks('azeroth');
  return createGame({
    seed,
    decks: { p1: decks[0].cards, p2: decks[1].cards },
    cardDefinitions: pack.cardsById,
    useMulligan,
  }).state;
}

interface GameRun {
  winner: PlayerId | null;
  steps: number;
  turns: number;
}

/**
 * Прогоняет партию одним ботом против самого себя.
 * Возвращает только финальный результат — этого достаточно
 * для тестов на детерминизм и на завершение.
 */
function runGame(bot: Bot, seed: string, maxSteps = 5000): GameRun {
  let state = newGame(seed);
  let steps = 0;
  while (!state.winner && steps < maxSteps) {
    const responder = pickResponder(state);
    if (responder === null) break;
    const cmd = bot.chooseCommand(state, responder);
    if (cmd === null) break;
    const r = applyCommand(state, cmd);
    if (r.events.some((e) => (e as { type?: string }).type === 'COMMAND_REJECTED')) {
      break;
    }
    state = r.state;
    steps++;
  }
  return { winner: state.winner ?? null, steps, turns: state.turnNumber };
}

// ───────────────────────────── tests ────────────────────────────────

describe('GreedyBot', () => {
  it('детерминирован при temperature = 0', () => {
    const a = runGame(new GreedyBot('A'), 'det-greedy');
    const b = runGame(new GreedyBot('B'), 'det-greedy');
    expect(a.winner).toBe(b.winner);
    expect(a.steps).toBe(b.steps);
    expect(a.turns).toBe(b.turns);
    expect(a.steps).toBeGreaterThan(10);
  });
});

describe('HeuristicBot', () => {
  it('детерминирован даже с temperature > 0', () => {
    // Два инстанса с одинаковыми параметрами на одном seed должны
    // сыграть идентично: RNG инициализируется от state.rngState,
    // никаких Math.random() внутри.
    const opts = { temperature: 0.5, mistakeRate: 0.2 };
    const a = runGame(new HeuristicBot('A', opts), 'deterministic-temp-seed');
    const b = runGame(new HeuristicBot('B', opts), 'deterministic-temp-seed');
    expect(a.winner).toBe(b.winner);
    expect(a.steps).toBe(b.steps);
    expect(a.turns).toBe(b.turns);
    expect(a.steps).toBeGreaterThan(10);
  });

  it('разные seed дают разные партии (с temperature > 0)', () => {
    const opts = { temperature: 0.5, mistakeRate: 0.2 };
    const bot = new HeuristicBot('X', opts);
    const lengths = ['s-a', 's-b', 's-c', 's-d', 's-e'].map(
      (s) => runGame(bot, s).steps,
    );
    expect(new Set(lengths).size).toBeGreaterThan(1);
  });

  it('temperature = 0 совпадает с прежним детерминированным поведением', () => {
    const a = runGame(new HeuristicBot('A', { temperature: 0, mistakeRate: 0 }), 'zero-temp');
    const b = runGame(new HeuristicBot('B', { temperature: 0, mistakeRate: 0 }), 'zero-temp');
    expect(a.winner).toBe(b.winner);
    expect(a.steps).toBe(b.steps);
  });
});