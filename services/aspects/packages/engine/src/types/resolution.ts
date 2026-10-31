import type { GameEvent } from './events';
import type { CardInstanceId, ColumnIndex, PlayerId } from './ids';
import type { TriggerType } from '@aspects/cards';

export interface PendingNeutralCapture {
  column: ColumnIndex;
  playerId: PlayerId;
  attackerId: CardInstanceId;
}

export interface ResolutionContext {
  events: GameEvent[];
  pendingNeutralCaptures: PendingNeutralCapture[];
  killedThisResolution?: Set<string>;
  resolvingTrigger?: { cardId: CardInstanceId; triggerType: TriggerType };
}