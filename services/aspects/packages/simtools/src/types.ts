import type { GameState, PlayerId, Command, GameEvent } from '@aspects/engine';
import type { Bot } from '@aspects/bot';

export interface BotPair {
  p1: Bot;
  p2: Bot;
}

export interface RunOptions {
  bots: BotPair;
  useMulligan?: boolean;
  maxSteps?: number;
  onAfterCommand?: (state: GameState, cmd: Command, events: GameEvent[]) => void;
}
export interface SingleGameResult {
  winner: PlayerId | null;
  winnerReason: string | null;
  turns: number;
  steps: number;
  hitLimit: boolean;
  finalState: GameState;
}

export interface RunSeriesOptions {
  series: string[];
  p1DeckId: string;
  p2DeckId: string;
  games: number;
  useMulligan?: boolean;
  botFactories?: { p1: () => Bot; p2: () => Bot };
  maxSteps?: number;
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