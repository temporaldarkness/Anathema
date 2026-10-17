import { createGame, applyCommand, type GameState, type PlayerId } from '@aspects/engine';
import {
  cardsForScope,
  decksForScope,
  type DeckPreset,
} from '@aspects/cards';
import { GreedyBot } from '@aspects/bot';
import type {
  BotPair,
  RunOptions,
  RunSeriesOptions,
  SeriesResult,
  SingleGameResult,
} from './types';

const DEFAULT_MAX_STEPS = 20_000;

/**
 * Находит пресет колоды в рамках scope (набора серий).
 * scope — массив серий.
 */
export function resolveDeck(series: string[], deckId: string): DeckPreset {
  const decks = decksForScope(series);
  const d = decks.find((x) => x.id === deckId);
  if (!d) {
    throw new Error(
      `Unknown deck "${deckId}" in scope [${series.join(', ')}]. ` +
        `Available: ${decks.map((x) => x.id).join(', ')}`,
    );
  }
  return d;
}

/**
 * Кто сейчас должен отвечать командой.
 */
export function pickResponder(state: GameState): PlayerId | null {
  if (state.winner) return null;
  if (state.pendingChoice) return state.pendingChoice.playerId;
  if (state.phase === 'MULLIGAN') {
    if (!state.mulliganDone.p1) return 'p1';
    if (!state.mulliganDone.p2) return 'p2';
    return null;
  }
  return state.activePlayer;
}

/**
 * Одна партия между двумя ботами в рамках scope.
 */
export function runOneGame(
  series: string[],
  p1DeckId: string,
  p2DeckId: string,
  seed: string,
  opts: RunOptions,
): SingleGameResult {
  const cardDefs = cardsForScope(series);
  const d1 = resolveDeck(series, p1DeckId);
  const d2 = resolveDeck(series, p2DeckId);
  const maxSteps = opts.maxSteps ?? DEFAULT_MAX_STEPS;

  let state: GameState = createGame({
    seed,
    decks: { p1: [...d1.cards], p2: [...d2.cards] },
    cardDefinitions: cardDefs,
    useMulligan: opts.useMulligan ?? false,
  }).state;

  const bots: BotPair = opts.bots;

  let steps = 0;
  let hitLimit = false;
  while (!state.winner && steps < maxSteps) {
    const responder = pickResponder(state);
    if (responder === null) break;

    const cmd = bots[responder].chooseCommand(state, responder);
    if (cmd === null) break;

    const r = applyCommand(state, cmd);
    if (r.events.some((e) => e.type === 'COMMAND_REJECTED')) {
      hitLimit = true;
      break;
    }
    state = r.state;
    steps++;

    if (opts.onAfterCommand) {
      opts.onAfterCommand(state, cmd, r.events);
    }
  }
  if (!state.winner && steps >= maxSteps) hitLimit = true;

  return {
    winner: state.winner ?? null,
    winnerReason: state.winnerReason ?? null,
    turns: state.turnNumber,
    steps,
    hitLimit,
    finalState: state,
  };
}

export function runSeries(opts: RunSeriesOptions): SeriesResult {
  const t0 = Date.now();
  const games = opts.games;
  const mkP1 = opts.botFactories?.p1 ?? (() => new GreedyBot('P1'));
  const mkP2 = opts.botFactories?.p2 ?? (() => new GreedyBot('P2'));

  let p1Wins = 0;
  let p2Wins = 0;
  let draws = 0;
  let totalTurns = 0;
  let totalSteps = 0;
  let hitLimitCount = 0;
  const reasons: Record<string, number> = {};

  for (let i = 0; i < games; i++) {
    const seed = `${opts.series.join('+')}-${opts.p1DeckId}-vs-${opts.p2DeckId}-${i}`;
    const r = runOneGame(opts.series, opts.p1DeckId, opts.p2DeckId, seed, {
      bots: { p1: mkP1(), p2: mkP2() },
      useMulligan: opts.useMulligan,
      maxSteps: opts.maxSteps,
    });

    if (r.winner === 'p1') p1Wins++;
    else if (r.winner === 'p2') p2Wins++;
    else draws++;

    totalTurns += r.turns;
    totalSteps += r.steps;
    if (r.hitLimit) hitLimitCount++;

    if (r.winnerReason) {
      reasons[r.winnerReason] = (reasons[r.winnerReason] ?? 0) + 1;
    }
  }

  return {
    games,
    p1Wins,
    p2Wins,
    draws,
    avgTurns: totalTurns / games,
    avgSteps: totalSteps / games,
    reasons,
    hitLimitCount,
    elapsedMs: Date.now() - t0,
  };
}

/**
 * Одна партия между двумя колодами (список card ids, не preset).
 * Используется deck-optimizer'ом, у которого нет пресетов.
 */
export function runOneGameRaw(
  series: string[],
  p1Cards: string[],
  p2Cards: string[],
  seed: string,
  opts: RunOptions,
): SingleGameResult {
  const cardDefs = cardsForScope(series);
  const maxSteps = opts.maxSteps ?? DEFAULT_MAX_STEPS;

  let state: GameState = createGame({
    seed,
    decks: { p1: [...p1Cards], p2: [...p2Cards] },
    cardDefinitions: cardDefs,
    useMulligan: opts.useMulligan ?? false,
  }).state;

  const bots: BotPair = opts.bots;

  let steps = 0;
  let hitLimit = false;
  while (!state.winner && steps < maxSteps) {
    const responder = pickResponder(state);
    if (responder === null) break;

    const cmd = bots[responder].chooseCommand(state, responder);
    if (cmd === null) break;

    const r = applyCommand(state, cmd);
    if (r.events.some((e) => e.type === 'COMMAND_REJECTED')) {
      hitLimit = true;
      break;
    }
    state = r.state;
    steps++;

    if (opts.onAfterCommand) {
      opts.onAfterCommand(state, cmd, r.events);
    }
  }
  if (!state.winner && steps >= maxSteps) hitLimit = true;

  return {
    winner: state.winner ?? null,
    winnerReason: state.winnerReason ?? null,
    turns: state.turnNumber,
    steps,
    hitLimit,
    finalState: state,
  };
}