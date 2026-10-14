import type { WritableDraft } from 'immer';
import type { GameState } from '../types/state';
import type { ResolutionContext } from '../types/resolution';
import type { CardInstanceId, PlayerId } from '../types/ids';
import { changeInfluence } from '../state/mutations';
import { resolveEffect } from '../abilities/effectResolver';

export interface UseAbilityParams {
  playerId: PlayerId;
  cardId: CardInstanceId;
  abilityIndex: number;
}

export function useAbilityInternal(
  draft: WritableDraft<GameState>,
  params: UseAbilityParams,
  ctx: ResolutionContext,
): { ok: true } | { ok: false; reason: string } {
  const { playerId, cardId, abilityIndex } = params;

  if (draft.activePlayer !== playerId) return { ok: false, reason: 'not_your_turn' };
  if (draft.phase !== 'PLAY' && draft.phase !== 'COMBAT') return { ok: false, reason: 'not_action_phase' };

  const card = draft.cards[cardId];
  if (!card) return { ok: false, reason: 'card_not_found' };
  if (card.controllerId !== playerId) return { ok: false, reason: 'not_your_card' };
  if (card.zone !== 'FRONT') return { ok: false, reason: 'card_not_in_front' };

  const def = draft.definitions[card.definitionId];
  if (!def) return { ok: false, reason: 'unknown_definition' };

  const abilities = def.activatedAbilities ?? [];
  if (abilityIndex < 0 || abilityIndex >= abilities.length) {
    return { ok: false, reason: 'ability_index_out_of_range' };
  }

  if (card.usedAbilitiesThisTurn.includes(abilityIndex)) {
    return { ok: false, reason: 'ability_already_used' };
  }

  const ability = abilities[abilityIndex];
  if (draft.players[playerId].influence < ability.cost) {
    return { ok: false, reason: 'not_enough_influence' };
  }

  if (ability.cost > 0) changeInfluence(draft, playerId, -ability.cost, ctx);

  card.usedAbilitiesThisTurn.push(abilityIndex);

  for (const effect of ability.effects) {
    if (!draft.cards[cardId]) break;
    resolveEffect(
      draft,
      effect,
      { sourceId: cardId, ownerId: playerId },
      ctx,
    );
    if (draft.pendingChoice) break;
  }

  return { ok: true };
}