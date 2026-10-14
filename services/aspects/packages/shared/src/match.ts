import { z } from 'zod';

/**
 * Одна запись команды в матче.
 * `command` — Command из движка, лежит как any, потому что это
 * большой union, описывать его в zod нецелесообразно.
 */
export const CommandRecordSchema = z.object({
  sequence: z.number().int().min(0),
  playerId: z.string(),
  command: z.any(),
});

export type CommandRecord = z.infer<typeof CommandRecordSchema>;

export const SaveMatchSchema = z.object({
  packId: z.string().min(1),
  seed: z.string(),
  player1Name: z.string().min(1).max(64),
  player2Name: z.string().min(1).max(64),
  winnerId: z.string().nullable(),
  winnerReason: z.string().nullable(),
  turnNumber: z.number().int().min(0),
  durationMs: z.number().int().min(0),
  p1BotName: z.string().nullable(),
  p2BotName: z.string().nullable(),
  deckP1: z.array(z.string()),
  deckP2: z.array(z.string()),
  commands: z.array(CommandRecordSchema),

  // Онлайн-поля. Опциональны: хотсит-игры сохраняются со старым
  // набором полей, там player1Id/player2Id не задаются.
  player1Id: z.string().nullable().optional(),
  player2Id: z.string().nullable().optional(),
});

export type SaveMatchDto = z.infer<typeof SaveMatchSchema>;

export interface MatchSummaryDto {
  id: string;
  player1Name: string;
  player2Name: string;
  player1Id: string | null;
  player2Id: string | null;
  winnerId: string | null;
  winnerReason: string | null;
  packId: string;
  turnNumber: number;
  durationMs: number;
  p1BotName: string | null;
  p2BotName: string | null;
  startedAt: string;
  endedAt: string | null;
}

export interface MatchDetailDto extends MatchSummaryDto {
  seed: string;
  deckP1: string[];
  deckP2: string[];
  commands: CommandRecord[];
}