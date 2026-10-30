import type { GameEvent } from './events';
import type { CardInstanceId, ColumnIndex, PlayerId } from './ids';

export interface PendingNeutralCapture {
  column: ColumnIndex;
  playerId: PlayerId;
  attackerId: CardInstanceId;
}

export interface ResolutionContext {
  events: GameEvent[];
  pendingNeutralCaptures: PendingNeutralCapture[];
  resolvingTrigger?: { cardId: CardInstanceId; triggerType: string };
}