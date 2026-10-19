import type { WritableDraft } from 'immer';
import type { GameState } from '../types/state';
import type { ResolutionContext } from '../types/resolution';
import type { PlayerId } from '../types/ids';
import { changeInfluence } from '../state/mutations';

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

  if (
    choice.kind === 'END_TURN_DISCARD' ||
    choice.kind === 'DISCARD_CHOSEN'
  ) {
    return { ok: false, reason: 'mandatory_choice' };
  }

  // Откат оплаты за активируемую способность.
  if (choice.kind === 'EFFECT_TARGET_SELECTION' && choice.continuation.paidAbility) {
    const { cardId, abilityIndex, influenceSpent } = choice.continuation.paidAbility;
    if (influenceSpent > 0) {
      changeInfluence(draft, choice.playerId, influenceSpent, ctx);
    }
    const card = draft.cards[cardId];
    if (card) {
      const idx = card.usedAbilitiesThisTurn.indexOf(abilityIndex);
      if (idx >= 0) card.usedAbilitiesThisTurn.splice(idx, 1);
    }
  }

  const kind = choice.kind;
  draft.pendingChoice = null;
  ctx.events.push({
    type: 'CHOICE_CANCELLED',
    playerId: params.playerId,
    kind,
  });
  return { ok: true };
}