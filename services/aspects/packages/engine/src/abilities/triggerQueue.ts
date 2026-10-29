import type { WritableDraft } from 'immer';
import type { GameState } from '../types/state';
import type { ResolutionContext } from '../types/resolution';
import { resolveEffect } from './effectResolver';
import { evaluateCondition } from './conditions';
import { cardTriggers } from '../state/helpers';

const MAX_TRIGGERS_PER_DRAIN = 500;

export function drainTriggerQueue(
  draft: WritableDraft<GameState>,
  ctx: ResolutionContext,
): void {
  let safety = MAX_TRIGGERS_PER_DRAIN;

  while (draft.pendingTriggers.length > 0) {
    if (draft.pendingChoice) return;

    if (safety-- <= 0) {
      ctx.events.push({
        type: 'COMMAND_REJECTED',
        playerId: 'p1',
        reason: 'trigger_loop_limit',
      });
      draft.pendingTriggers.length = 0;
      return;
    }

    const trigger = draft.pendingTriggers.shift()!;
    const card = draft.cards[trigger.cardId];
    if (!card) continue;

    const onBoard = card.zone === 'FRONT' || card.zone === 'RESERVE';

    if (
      trigger.triggerType !== 'ON_EXIT' &&
      trigger.triggerType !== 'ON_KILL' &&
      trigger.triggerType !== 'ON_THIS_DAMAGED' &&
      !onBoard
    ) {
      continue;
    }
    if (trigger.triggerType === 'ON_REINFORCE' && card.zone !== 'FRONT') continue;

    const triggers = cardTriggers(draft as GameState, trigger.cardId);
    if (triggers.length === 0) continue;

    const matching = triggers.filter((t) => t.trigger === trigger.triggerType);

    for (const ability of matching) {
      const liveCard = draft.cards[trigger.cardId];
      if (!liveCard) break;

      if (
        ability.oncePerTurn &&
        ability.id &&
        liveCard.usedTriggerIdsThisTurn.includes(ability.id)
      ) {
        continue;
      }

      if (
        ability.condition &&
        !evaluateCondition(draft, ability.condition, card.ownerId, trigger.cardId)
      ) {
        continue;
      }

      if (ability.oncePerTurn && ability.id) {
        liveCard.usedTriggerIdsThisTurn.push(ability.id);
      }

      for (const effect of ability.effects) {
        if (!draft.cards[trigger.cardId]) break;
        resolveEffect(
          draft,
          effect,
          {
            sourceId: trigger.cardId,
            ownerId: card.ownerId,
            attackerId: trigger.attackerId,
			defenderId: trigger.defenderId,
          },
          ctx,
        );
        if (draft.pendingChoice) return;
      }
    }
  }
}