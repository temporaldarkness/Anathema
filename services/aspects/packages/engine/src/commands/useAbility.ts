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

  const discardCost = (ability as { discardCost?: number }).discardCost ?? 0;

  // Есть discardCost — ставим выбор карт для сброса.
  // Инфлуенс и карты спишутся на RESOLVE_CHOICE.
  if (discardCost > 0) {
    const hand = draft.players[playerId].hand;
    if (hand.length < discardCost) {
      return { ok: false, reason: 'not_enough_cards_to_discard' };
    }
    draft.pendingChoice = {
      kind: 'ACTIVATION_DISCARD',
      playerId,
      sourceCardId: cardId,
      abilityIndex,
      count: discardCost,
      eligibleCardIds: [...hand],
    };
    ctx.events.push({
      type: 'CHOICE_REQUESTED',
      playerId,
      kind: 'ACTIVATION_DISCARD',
      count: discardCost,
    });
    return { ok: true };
  }

  // Без discardCost — мгновенное применение.
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
    if (draft.pendingChoice) {
      if (draft.pendingChoice.kind === 'EFFECT_TARGET_SELECTION') {
        draft.pendingChoice.continuation.paidAbility = {
          cardId,
          abilityIndex,
          influenceSpent: ability.cost,
        };
      }
      break;
    }
  }

  return { ok: true };
}

/**
 * Применяет активацию с discardCost. Вызывается из resolveChoice,
 * когда игрок выбрал карты на сброс.
 */
export function applyActivationDiscard(
  draft: WritableDraft<GameState>,
  params: {
    playerId: PlayerId;
    sourceCardId: CardInstanceId;
    abilityIndex: number;
    discardCardIds: CardInstanceId[];
  },
  ctx: ResolutionContext,
): { ok: true } | { ok: false; reason: string } {
  const { playerId, sourceCardId, abilityIndex, discardCardIds } = params;

  const card = draft.cards[sourceCardId];
  if (!card) return { ok: false, reason: 'card_not_found' };
  if (card.controllerId !== playerId) return { ok: false, reason: 'not_your_card' };
  if (card.zone !== 'FRONT') return { ok: false, reason: 'card_not_in_front' };

  const def = draft.definitions[card.definitionId];
  if (!def) return { ok: false, reason: 'unknown_definition' };
  const abilities = def.activatedAbilities ?? [];
  if (abilityIndex < 0 || abilityIndex >= abilities.length) {
    return { ok: false, reason: 'ability_index_out_of_range' };
  }
  const ability = abilities[abilityIndex];

  if (card.usedAbilitiesThisTurn.includes(abilityIndex)) {
    return { ok: false, reason: 'ability_already_used' };
  }
  if (draft.players[playerId].influence < ability.cost) {
    return { ok: false, reason: 'not_enough_influence' };
  }

  // Сбрасываем карты.
  for (const id of discardCardIds) {
    const hand = draft.players[playerId].hand;
    const idx = hand.indexOf(id);
    if (idx < 0) continue;
    hand.splice(idx, 1);
    const c = draft.cards[id];
    if (c) {
      c.zone = 'DISCARD';
      c.column = null;
    }
    if (!c?.isToken) draft.players[playerId].discard.push(id);
    ctx.events.push({ type: 'CARD_DISCARDED', playerId, cardId: id });
  }

  if (ability.cost > 0) changeInfluence(draft, playerId, -ability.cost, ctx);

  card.usedAbilitiesThisTurn.push(abilityIndex);

  for (const effect of ability.effects) {
    if (!draft.cards[sourceCardId]) break;
    resolveEffect(
      draft,
      effect,
      { sourceId: sourceCardId, ownerId: playerId },
      ctx,
    );
    if (draft.pendingChoice) {
      if (draft.pendingChoice.kind === 'EFFECT_TARGET_SELECTION') {
        draft.pendingChoice.continuation.paidAbility = {
          cardId: sourceCardId,
          abilityIndex,
          influenceSpent: ability.cost,
        };
      }
      break;
    }
  }

  return { ok: true };
}