import type { WritableDraft } from 'immer';
import type { GameState } from '../types/state';
import type { ResolutionContext } from '../types/resolution';
import type { PlayerId } from '../types/ids';

export interface CancelChoiceParams {
  playerId: PlayerId;
}

export function cancelChoiceInternal(
  draft: WritableDraft<GameState>,
  params: CancelChoiceParams,
  ctx: ResolutionContext,
): { ok: true } | { ok: false; reason: string } {
  const choice = draft.pendingChoice;
  if (!choice) return { ok: false, reason: 'no_pending_choice' };
  if (choice.playerId !== params.playerId) return { ok: false, reason: 'not_your_choice' };

  const kind = choice.kind;
  draft.pendingChoice = null;
  ctx.events.push({
    type: 'CHOICE_CANCELLED',
    playerId: params.playerId,
    kind,
  });
  return { ok: true };
}