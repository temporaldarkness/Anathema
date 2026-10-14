import type { WritableDraft } from 'immer';
import type { GameState } from '../types/state';
import type { ResolutionContext } from '../types/resolution';
import type { CardInstanceId, PlayerId } from '../types/ids';
import { enqueueTrigger } from '../state/triggerEnqueue';

export function queuePhaseTriggers(
  draft: WritableDraft<GameState>,
  triggerType: 'ON_TURN_START' | 'ON_TURN_END',
  playerId: PlayerId,
  _ctx: ResolutionContext,
): void {
  const ids: CardInstanceId[] = [];
  for (const col of draft.board) {
    const id = playerId === 'p1' ? col.p1Front : col.p2Front;
    if (id) ids.push(id);
  }
  for (const id of ids) {
    enqueueTrigger(draft, id, triggerType);
  }
}