import type { WritableDraft } from 'immer';
import type { GameState } from '../types/state';
import type { CardInstanceId } from '../types/ids';
import type { TriggerType } from '@aspects/cards';

export function enqueueTrigger(
  draft: WritableDraft<GameState>,
  cardId: CardInstanceId,
  triggerType: TriggerType,
  attackerId?: CardInstanceId,
): void {
  draft.pendingTriggers.push({ cardId, triggerType, attackerId });
}