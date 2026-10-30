import type { WritableDraft } from 'immer';
import type { GameState } from '../types/state';
import type { ResolutionContext } from '../types/resolution';
import type { CardInstanceId, PlayerId } from '../types/ids';
import { opponentOf } from '../types/ids';
import { promoteFromReserve } from '../state/mutations';
import { queuePhaseTriggers } from '../abilities/triggerEngine';
import { resolveEffect } from '../abilities/effectResolver';
import { advancePhaseInternal } from './advancePhase';
import { processTemporaryCards } from './advancePhase';
import { controlledCells } from '../state/helpers';
import { applyReplacementInternal } from './replace';
import { applyActivationDiscard } from './useAbility';
import { changeInfluence } from '../state/mutations';

export interface ResolveChoiceParams {
  playerId: PlayerId;
  cardIds: CardInstanceId[];
}

export function resolveChoiceInternal(
  draft: WritableDraft<GameState>,
  params: ResolveChoiceParams,
  ctx: ResolutionContext,
): { ok: true } | { ok: false; reason: string } {
  const choice = draft.pendingChoice;
  if (!choice) return { ok: false, reason: 'no_pending_choice' };
  if (choice.playerId !== params.playerId) return { ok: false, reason: 'not_your_choice' };

  if (
    choice.kind === 'EFFECT_TARGET_SELECTION' &&
    params.cardIds.length === 0
  ) {
    if (choice.continuation.paidAbility) {
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
    draft.pendingChoice = null;
    ctx.events.push({
      type: 'CHOICE_RESOLVED',
      playerId: choice.playerId,
      kind: 'EFFECT_TARGET_SELECTION',
    });
    return { ok: true };
  }

  const expectedCount =
    choice.kind === 'REPLACE_TARGET_SELECTION' ? 1 : choice.count;
  if (params.cardIds.length !== expectedCount) {
    return { ok: false, reason: 'wrong_card_count' };
  }

  const seen = new Set<CardInstanceId>();
  for (const id of params.cardIds) {
    if (seen.has(id)) return { ok: false, reason: 'duplicate_cards' };
    seen.add(id);
    if (!choice.eligibleCardIds.includes(id)) return { ok: false, reason: 'card_not_eligible' };
  }

  switch (choice.kind) {
    case 'END_TURN_DISCARD': {
      const player = choice.playerId;
      for (const id of params.cardIds) {
        const hand = draft.players[player].hand;
        const idx = hand.indexOf(id);
        if (idx < 0) continue;
        hand.splice(idx, 1);
        draft.players[player].discard.push(id);
        const card = draft.cards[id];
        if (card) {
          card.zone = 'DISCARD';
          card.column = null;
        }
        ctx.events.push({ type: 'CARD_DISCARDED', playerId: player, cardId: id });
      }
      draft.pendingChoice = null;
      ctx.events.push({ type: 'CHOICE_RESOLVED', playerId: player, kind: 'END_TURN_DISCARD' });

      if (draft.players[player].glory < 10) {
        for (let i = 0; i < 5; i++) {
          const col = draft.board[i];
          const reserveId = player === 'p1' ? col.p1Reserve : col.p2Reserve;
          if (reserveId) promoteFromReserve(draft, reserveId, ctx);
        }
      }

      processTemporaryCards(draft, ctx);

      draft.activePlayer = opponentOf(draft.activePlayer);
      draft.turnNumber += 1;
      draft.players[draft.activePlayer].replacementUsedThisTurn = false;
      draft.players[draft.activePlayer].cardsPlayedThisTurn = 0;
      const newActive = draft.activePlayer;
      for (const id of Object.keys(draft.cards) as CardInstanceId[]) {
        const card = draft.cards[id];
        if (card.ownerId !== newActive) continue;
        if (card.usedAbilitiesThisTurn.length > 0) {
          card.usedAbilitiesThisTurn = [];
        }
        if (card.usedTriggerIdsThisTurn.length > 0) {
          card.usedTriggerIdsThisTurn = [];
        }
      }
      draft.phase = 'RESTORE';
      ctx.events.push({
        type: 'TURN_STARTED',
        playerId: draft.activePlayer,
        turnNumber: draft.turnNumber,
      });
      ctx.events.push({
        type: 'PHASE_CHANGED',
        playerId: draft.activePlayer,
        phase: 'RESTORE',
      });
      queuePhaseTriggers(draft, 'ON_TURN_START', draft.activePlayer, ctx);

      const p = draft.activePlayer;
      if (controlledCells(draft as GameState, p) === 5) {
        if (draft.altVictoryPending[p]) {
          draft.winner = p;
          draft.winnerReason = 'alt_victory';
          ctx.events.push({ type: 'GAME_OVER', winner: p, reason: 'alt_victory' });
        } else {
          draft.altVictoryPending[p] = true;
        }
      } else {
        draft.altVictoryPending[p] = false;
      }

      advancePhaseInternal(draft, ctx);
      return { ok: true };
    }

    case 'EFFECT_TARGET_SELECTION': {
      const cont = choice.continuation;
      const startIndex = cont.startIndex ?? 0;
      draft.pendingChoice = null;
      ctx.events.push({
        type: 'CHOICE_RESOLVED',
        playerId: choice.playerId,
        kind: 'EFFECT_TARGET_SELECTION',
      });

      for (const effect of cont.then.slice(startIndex)) {
        if (!draft.cards[cont.sourceId] && effect.kind !== 'DAMAGE_GLORY' && effect.kind !== 'HEAL_GLORY') {
        }
        resolveEffect(
          draft,
          effect,
          {
            sourceId: cont.sourceId,
            ownerId: cont.ownerId,
            attackerId: cont.attackerId,
            defenderId: cont.defenderId,
          },
          ctx,
          params.cardIds,
        );
        if (draft.pendingChoice) break;
      }
      return { ok: true };
    }

    case 'REPLACE_TARGET_SELECTION': {
      const newCardId = choice.newCardId;
      const targetCardId = params.cardIds[0];
      draft.pendingChoice = null;
      ctx.events.push({
        type: 'CHOICE_RESOLVED',
        playerId: choice.playerId,
        kind: 'REPLACE_TARGET_SELECTION',
      });

      const res = applyReplacementInternal(
        draft,
        {
          playerId: choice.playerId,
          newCardId,
          targetCardId,
        },
        ctx,
      );
      if (!res.ok) {
        ctx.events.push({
          type: 'COMMAND_REJECTED',
          playerId: choice.playerId,
          reason: `replacement_failed:${res.reason}`,
        });
      }
      return { ok: true };
    }

    case 'DISCARD_CHOSEN': {
      const target = choice.targetPlayerId;
      for (const id of params.cardIds) {
        const hand = draft.players[target].hand;
        const idx = hand.indexOf(id);
        if (idx < 0) continue;
        hand.splice(idx, 1);
        const card = draft.cards[id];
        if (card) {
          card.zone = 'DISCARD';
          card.column = null;
        }
        if (!card?.isToken) draft.players[target].discard.push(id);
        ctx.events.push({ type: 'CARD_DISCARDED', playerId: target, cardId: id });
      }
      draft.pendingChoice = null;
      ctx.events.push({
        type: 'CHOICE_RESOLVED',
        playerId: choice.playerId,
        kind: 'DISCARD_CHOSEN',
      });
      return { ok: true };
    }

    case 'ACTIVATION_DISCARD': {
      const sourceCardId = choice.sourceCardId;
      const abilityIndex = choice.abilityIndex;
      draft.pendingChoice = null;
      ctx.events.push({
        type: 'CHOICE_RESOLVED',
        playerId: choice.playerId,
        kind: 'ACTIVATION_DISCARD',
      });

      const res = applyActivationDiscard(
        draft,
        {
          playerId: choice.playerId,
          sourceCardId,
          abilityIndex,
          discardCardIds: params.cardIds,
        },
        ctx,
      );
      if (!res.ok) {
        ctx.events.push({
          type: 'COMMAND_REJECTED',
          playerId: choice.playerId,
          reason: `activation_failed:${res.reason}`,
        });
      }
      return { ok: true };
    }

    default: {
      return { ok: false, reason: 'unhandled_choice_kind' };
    }
  }
}