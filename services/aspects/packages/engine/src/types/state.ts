import type { CardDefinition, ResolvedCardDefinition } from '@aspects/cards';
import type { Effect, TriggerType } from '@aspects/cards';
import type { CardInstanceId, ColumnIndex, PlayerId } from './ids';

export type Zone = 'DECK' | 'HAND' | 'RESERVE' | 'FRONT' | 'DISCARD';

export type Phase =
  | 'MULLIGAN'
  | 'RESTORE'
  | 'MOVE'
  | 'DRAW'
  | 'INFLUENCE'
  | 'PLAY'
  | 'COMBAT'
  | 'END';

export interface Modifier {
  source: string;
  stat: 'health' | 'strength';
  delta: number;
}

export interface CardInstance {
  instanceId: CardInstanceId;
  definitionId: string;
  ownerId: PlayerId;
  controllerId: PlayerId;
  zone: Zone;
  column: ColumnIndex | null;

  baseHealth: number;
  baseStrength: number;
  damageTaken: number;
  modifiers: Modifier[];

  exhausted: boolean;
  slowCounter: number;
  shieldAvailable: boolean;

  turnsOnBoard: number;
  
  usedAbilitiesThisTurn: number[];
  usedTriggerIdsThisTurn: string[];
  
  isToken: boolean;
  sharesIdentity: boolean;
  tempTurnsLeft: number | null;
  readyForFront: boolean;
}

export interface Column {
  p1Front: CardInstanceId | null;
  p1Reserve: CardInstanceId | null;
  neutralOwner: PlayerId | null;
  p2Front: CardInstanceId | null;
  p2Reserve: CardInstanceId | null;
}

export interface PlayerState {
  id: PlayerId;
  influence: number;
  glory: number;

  deck: CardInstanceId[];
  hand: CardInstanceId[];
  discard: CardInstanceId[];

  replacementUsedThisTurn: boolean;
  cardsPlayedThisTurn: number;
}

export interface PendingTrigger {
  cardId: CardInstanceId;
  triggerType: TriggerType;
}

export interface PendingEffectContinuation {
  sourceId: CardInstanceId;
  ownerId: PlayerId;
  then: Effect[];
}

export type PendingChoice =
  | {
      kind: 'END_TURN_DISCARD';
      playerId: PlayerId;
      count: number;
      eligibleCardIds: CardInstanceId[];
    }
  | {
      kind: 'EFFECT_TARGET_SELECTION';
      playerId: PlayerId;
      count: number;
      eligibleCardIds: CardInstanceId[];
      continuation: PendingEffectContinuation;
    };

export interface GameState {
  definitions: Record<string, ResolvedCardDefinition>;
  cards: Record<CardInstanceId, CardInstance>;

  players: Record<PlayerId, PlayerState>;
  board: Column[];

  activePlayer: PlayerId;
  turnNumber: number;
  phase: Phase;

  seed: string;
  rngState: number;

  winner: PlayerId | null;
  winnerReason: string | null;

  altVictoryPending: Record<PlayerId, boolean>;

  pendingChoice: PendingChoice | null;
  
  pendingTriggers: PendingTrigger[];
  
  instanceCounter: number;
  
  mulliganDone: Record<PlayerId, boolean>;
  mulliganReplaced: Record<PlayerId, number>;
}