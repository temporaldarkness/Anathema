import type { WritableDraft } from 'immer';
import type { GameState } from '../types/state';
import type { ResolutionContext } from '../types/resolution';
import type { PlayerId } from '../types/ids';
import { advancePhaseInternal } from './advancePhase';

export function endTurnInternal(
  draft: WritableDraft<GameState>,
  playerId: PlayerId,
  ctx: ResolutionContext,
): { ok: true } | { ok: false; reason: string } {
  if (draft.activePlayer !== playerId) return { ok: false, reason: 'not_your_turn' };

  const startingPlayer = draft.activePlayer;
  let safety = 6;
  while (draft.activePlayer === startingPlayer && safety-- > 0) {
    advancePhaseInternal(draft, ctx);
  }
  return { ok: true };
}