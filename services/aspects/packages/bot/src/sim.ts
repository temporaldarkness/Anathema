import {
  createGame,
  applyCommand,
  type GameState,
  type PlayerId,
  type Command,
} from '@aspects/engine';
import { getPack, getDecks } from '@aspects/cards';
import { GreedyBot } from './greedy';
import type { Bot } from './types';

export interface SingleGameResult {
  winner: PlayerId | null;
  winnerReason: string | null;
  turns: number;
  steps: number;
  hitLimit: boolean;
}

export interface SeriesResult {
  games: number;
  p1Wins: number;
  p2Wins: number;
  draws: number;
  avgTurns: number;
  avgSteps: number;
  reasons: Record<string, number>;
  hitLimitCount: number;
  elapsedMs: number;
}

export interface SeriesOptions {
  packId: string;
  p1DeckId: string;
  p2DeckId: string;
  games: number;
  seedPrefix?: string;
  maxSteps?: number;
  useMulligan?: boolean;
  botFactories?: { p1?: () => Bot; p2?: () => Bot };
}

const DEFAULT_MAX_STEPS = 20_000;

export function resolveDeck(packId: string, deckId: string) {
  const decks = getDecks(packId);
  const deck = decks.find((d) => d.id === deckId);
  if (!deck) {
    throw new Error(
      `Deck "${deckId}" not found in pack "${packId}". ` +
        `Available: ${decks.map((d) => d.id).join(', ')}`,
    );
  }
  return deck;
}
export interface SingleGameOptions {
  maxSteps?: number;
  bots?: { p1: Bot; p2: Bot };
  useMulligan?: boolean
}

export function runSingleGame(
  packId: string,
  p1DeckId: string,
  p2DeckId: string,
  seed: string,
  opts: SingleGameOptions = {},
): SingleGameResult {
  const pack = getPack(packId);
  const p1 = resolveDeck(packId, p1DeckId);
  const p2 = resolveDeck(packId, p2DeckId);

  let state: GameState = createGame({
    seed,
    decks: { p1: p1.cards, p2: p2.cards },
    cardDefinitions: pack.cardsById,
    useMulligan: opts.useMulligan ?? false,
  }).state;

  const bots = opts.bots ?? { p1: new GreedyBot(), p2: new GreedyBot() };
  const maxSteps = opts.maxSteps ?? DEFAULT_MAX_STEPS;
  let steps = 0;

  while (!state.winner && steps < maxSteps) {
    let respondingPlayer: PlayerId;
    if (state.pendingChoice) {
      respondingPlayer = state.pendingChoice.playerId;
    } else if (state.phase === 'MULLIGAN') {
      if (!state.mulliganDone['p1']) respondingPlayer = 'p1';
      else if (!state.mulliganDone['p2']) respondingPlayer = 'p2';
      else break; // не должны сюда попасть
    } else {
      respondingPlayer = state.activePlayer;
    }

    const bot = respondingPlayer === 'p1' ? bots.p1 : bots.p2;
    const cmd = bot.chooseCommand(state, respondingPlayer);
    if (!cmd) break;

    const r = applyCommand(state, cmd);
    if (
      r.events.some(
        (e) => (e as { type?: string }).type === 'COMMAND_REJECTED',
      )
    ) {
      console.warn(
        `[sim] COMMAND_REJECTED at step ${steps}: ${JSON.stringify(cmd)}`,
      );
      break;
    }
    state = r.state;
    steps++;
  }

  return {
    winner: state.winner ?? null,
    winnerReason: state.winnerReason ?? null,
    turns: state.turnNumber,
    steps,
    hitLimit: steps >= maxSteps && !state.winner,
  };
}
export function runSeries(opts: SeriesOptions): SeriesResult {
  const { packId, p1DeckId, p2DeckId, games } = opts;
  const seedPrefix =
    opts.seedPrefix ?? `simulate-${p1DeckId}-vs-${p2DeckId}`;
  const maxSteps = opts.maxSteps ?? DEFAULT_MAX_STEPS;

  const started = Date.now();
  let p1Wins = 0;
  let p2Wins = 0;
  let draws = 0;
  let totalTurns = 0;
  let totalSteps = 0;
  let hitLimitCount = 0;
  const reasons: Record<string, number> = {};
  
  const bots = {
    p1: opts.botFactories?.p1?.() ?? new GreedyBot(),
    p2: opts.botFactories?.p2?.() ?? new GreedyBot(),
  };

  for (let i = 0; i < games; i++) {
    const r = runSingleGame(packId, p1DeckId, p2DeckId, `${seedPrefix}-${i}`, {
      maxSteps,
	  useMulligan: opts.useMulligan,
      bots,
    });
    if (r.winner === 'p1') p1Wins++;
    else if (r.winner === 'p2') p2Wins++;
    else draws++;
    totalTurns += r.turns;
    totalSteps += r.steps;
    if (r.hitLimit) hitLimitCount++;
    const key = r.winner
      ? (r.winnerReason ?? 'unknown')
      : 'no_winner';
    reasons[key] = (reasons[key] ?? 0) + 1;
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
    elapsedMs: Date.now() - started,
  };
}