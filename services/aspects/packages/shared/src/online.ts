import { z } from 'zod';
import type { CommandRecord } from './match';

export interface RoomState {
  code: string;
  ownerId: string;
  ownerName: string;
  guestId: string | null;
  guestName: string | null;
  series: string[];
  gameState: unknown;
  createdAt: number;
  lastActivityAt: number;
  version: number;
  turnDeadlineAt: number | null;
  turnOwner: 'p1' | 'p2' | null;
  deckP1: string[];
  deckP2: string[] | null;
  rematchProposedBy?: 'p1' | 'p2' | null;
  rematchProposedAt?: number | null;
  allowSpectators: boolean;
  spectatorIds: string[];
  turnKey?: string | null;
  ratingApplied?: boolean;
  ownerDisconnectedAt?: number | null;
  guestDisconnectedAt?: number | null;
  takeoverOpenFor?: 'p1' | 'p2' | null;
  
  /** Seed, с которым создана партия. Нужен для реплея. */
  seed?: string | null;

  /** Все команды с момента создания партии — для реплея. */
  commands?: CommandRecord[];

  /** Флаг: матч уже сохранён в Matches (защита от двойного сохранения). */
  matchSaved?: boolean;
}

export interface RoomPublicInfo {
  code: string;
  ownerId: string;
  ownerName: string;
  guestId: string | null;
  guestName: string | null;
  series: string[];
  createdAt: number;
  hasGuest: boolean;
  status: 'waiting' | 'ready' | 'in-progress' | 'finished';
  turnDeadlineAt: number | null;
  turnOwner: 'p1' | 'p2' | null;
  allowSpectators: boolean;
  spectatorCount: number;
  ownerDisconnectedAt: number | null;
  guestDisconnectedAt: number | null;
  takeoverOpenFor: 'p1' | 'p2' | null;
}

export const CreateRoomSchema = z.object({
  series: z.array(z.string().min(1)).min(1).max(4),
  deckP1Id: z.string(),
  deckP1Cards: z.array(z.string()).nullable(),
  p1BotName: z.string().nullable(),
  allowSpectators: z.boolean().optional().default(false),
});

export type CreateRoomDto = z.infer<typeof CreateRoomSchema>;

export const JoinRoomSchema = z.object({
  deckP2Id: z.string(),
  deckP2Cards: z.array(z.string()).nullable(),
  p2BotName: z.string().nullable(),
});

export type JoinRoomDto = z.infer<typeof JoinRoomSchema>;

export interface ClientToServerEvents {
  subscribe: (payload: {
    roomCode: string;
    role?: 'player' | 'spectator';
  }) => void;
  command: (payload: { command: unknown; expectedVersion: number }) => void;
  rematch_propose: () => void;
  rematch_respond: (payload: { accept: boolean }) => void;
}

export interface ServerToClientEvents {
  state_sync: (payload: {
    state: unknown;
    version: number;
    roomInfo: RoomPublicInfo;
    events: unknown[];
    myPlayerId: 'p1' | 'p2' | null;
    opponentHandCount: number | null;
    turnDeadlineAt: number | null;
    turnOwner: 'p1' | 'p2' | null;
    rematchProposedBy: 'p1' | 'p2' | null;
    role: 'player' | 'spectator';
  }) => void;
  state_update: (payload: {
    state: unknown;
    version: number;
    events: unknown[];
    myPlayerId: 'p1' | 'p2' | null;
    opponentHandCount: number | null;
    turnDeadlineAt: number | null;
    turnOwner: 'p1' | 'p2' | null;
    rematchProposedBy: 'p1' | 'p2' | null;
  }) => void;
  command_error: (payload: { reason: string; expectedVersion: number }) => void;
  guest_joined: (payload: { guestName: string; roomInfo: RoomPublicInfo }) => void;
  guest_left: (payload: { guestName: string }) => void;
  opponent_left: (payload: { side: 'p1' | 'p2'; name: string }) => void;
  opponent_joined: (payload: { side: 'p1' | 'p2'; name: string }) => void;
  rematch_update: (payload: {
    proposedBy: 'p1' | 'p2' | null;
    event: 'sync' | 'proposed' | 'declined' | 'expired';
    byName?: string;
  }) => void;
  room_expired: (payload: { reason: string }) => void;
  game_over: (payload: { winner: string; reason: string }) => void;
  rating_updated: (payload: {
    side: 'winner' | 'loser';
    delta: string;
    after: number;
    tier: string;
  }) => void;
}

// ─── Matchmaking ───

export const MatchmakingQueueSchema = z.object({
  series: z.array(z.string().min(1)).min(1).max(4),
  deckId: z.string(),
  deckCards: z.array(z.string()).length(30),
});

export type MatchmakingQueueDto = z.infer<typeof MatchmakingQueueSchema>;

export interface MatchmakingStatusDto {
  inQueue: boolean;
  series: string[] | null;
  queuedAt: number | null;
  position: number | null;
  totalInQueue: number | null;
}