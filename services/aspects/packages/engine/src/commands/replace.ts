import type { WritableDraft } from 'immer';
import type { GameState } from '../types/state';
import type { ResolutionContext } from '../types/resolution';
import type { CardInstanceId, PlayerId } from '../types/ids';
import { columnBonuses, findCardLocation, getColumn } from '../state/helpers';
import {
  changeInfluence,
  killCardNoExit,
  removeFromHand,
  promoteFromReserve,
  resetCardRuntimeState,
} from '../state/mutations';
import { enqueueTrigger } from '../state/triggerEnqueue';
import { hasAbility } from '../state/abilities';

export interface ReplaceParams {
  playerId: PlayerId;
  cardId: CardInstanceId;
}

export interface ApplyReplacementParams {
  playerId: PlayerId;
  newCardId: CardInstanceId;
  targetCardId: CardInstanceId;
}

/**
 * Проверяет возможность замены и, если всё в порядке, ставит pendingChoice
 * с выбором цели. Реальная замена выполняется в applyReplacementInternal
 * после ответа игрока.
 */
export function replaceInternal(
  draft: WritableDraft<GameState>,
  params: ReplaceParams,
  ctx: ResolutionContext,
): { ok: true } | { ok: false; reason: string } {
  const { playerId, cardId } = params;

  if (draft.activePlayer !== playerId) return { ok: false, reason: 'not_your_turn' };
  if (draft.phase !== 'PLAY') return { ok: false, reason: 'not_play_phase' };
  if (draft.players[playerId].replacementUsedThisTurn) {
    return { ok: false, reason: 'replacement_already_used' };
  }

  const newCard = draft.cards[cardId];
  if (!newCard) return { ok: false, reason: 'card_not_found' };
  if (!draft.players[playerId].hand.includes(cardId)) return { ok: false, reason: 'card_not_in_hand' };

  const newDef = draft.definitions[newCard.definitionId];
  if (!newDef) return { ok: false, reason: 'unknown_definition' };

  const personality = newDef.personalityTag;
  const candidates: CardInstanceId[] = [];
  const columnReduction = columnBonuses(draft as GameState, playerId).costReduction;
  const playerInfluence = draft.players[playerId].influence;

  for (const col of draft.board) {
    const keys: ('p1Front' | 'p1Reserve' | 'p2Front' | 'p2Reserve')[] =
      playerId === 'p1' ? ['p1Front', 'p1Reserve'] : ['p2Front', 'p2Reserve'];
    for (const k of keys) {
      const id = col[k];
      if (!id) continue;
      const c = draft.cards[id];
      const def = draft.definitions[c.definitionId];
      if (!def || def.personalityTag !== personality) continue;
      if (def.cantBeReplaced) continue;

      // Проверяем, что игроку хватит влияния на замену ИМЕННО этого кандидата.
      const discount = Math.min(
        Math.floor(def.cost / 2),
        Math.floor(newDef.cost / 2),
      );
      const candidateCost = Math.max(0, newDef.cost - discount - columnReduction);
      if (playerInfluence < candidateCost) continue;

      candidates.push(id);
    }
  }

  if (candidates.length === 0) {
    // Различаем: нет подходящей личности вообще, или есть но не хватает влияния.
    // Для простоты возвращаем no_matching — проверка влияния уже учтена.
    return { ok: false, reason: 'no_matching_card_on_board' };
  }

  draft.pendingChoice = {
    kind: 'REPLACE_TARGET_SELECTION',
    playerId,
    newCardId: cardId,
    eligibleCardIds: candidates,
  };
  ctx.events.push({
    type: 'CHOICE_REQUESTED',
    playerId,
    kind: 'REPLACE_TARGET_SELECTION',
    count: 1,
  });

  return { ok: true };
}

/**
 * Применяет замену. Вызывается из resolveChoice, когда игрок выбрал цель.
 * Все проверки уже выполнены в replaceInternal, состояние не может
 * стать невалидным между постановкой выбора и его резолвом.
 */
export function applyReplacementInternal(
  draft: WritableDraft<GameState>,
  params: ApplyReplacementParams,
  ctx: ResolutionContext,
): { ok: true } | { ok: false; reason: string } {
  const { playerId, newCardId, targetCardId } = params;

  const newCard = draft.cards[newCardId];
  if (!newCard) return { ok: false, reason: 'card_not_found' };
  if (!draft.players[playerId].hand.includes(newCardId)) {
    return { ok: false, reason: 'card_not_in_hand' };
  }

  const newDef = draft.definitions[newCard.definitionId];
  if (!newDef) return { ok: false, reason: 'unknown_definition' };

  const oldCard = draft.cards[targetCardId];
  if (!oldCard) return { ok: false, reason: 'target_not_found' };

  const oldDef = draft.definitions[oldCard.definitionId];
  if (!oldDef || oldDef.personalityTag !== newDef.personalityTag) {
    return { ok: false, reason: 'target_personality_mismatch' };
  }
  if (oldDef.cantBeReplaced) {
    return { ok: false, reason: 'cant_be_replaced' };
  }

  const oldLocation = findCardLocation(draft as GameState, targetCardId);
  if (!oldLocation) return { ok: false, reason: 'target_not_on_board' };

    // Скидка на замену: floor(old_cost / 2), но не больше floor(new_cost / 2).
    // Поощряет замену дорогих карт (5→5: скидка 2), но не даёт прибыли
    // при даунгрейде (5→1: скидка 0). Складывается с −1 от колонки 1.
    const columnReduction = columnBonuses(draft as GameState, playerId).costReduction;
    const oldCost = oldDef.cost;
    const discount = Math.min(
      Math.floor(oldCost / 2),
      Math.floor(newDef.cost / 2),
    );
    const cost = Math.max(0, newDef.cost - discount - columnReduction);
    if (draft.players[playerId].influence < cost) {
      return { ok: false, reason: 'not_enough_influence' };
    }
    if (cost > 0) changeInfluence(draft, playerId, -cost, ctx);

  const wasExhausted = oldCard.exhausted;
  const wasAttacksThisTurn = oldCard.attacksThisTurn;
  const oldColumn = oldLocation.column;

  killCardNoExit(draft, targetCardId);

  removeFromHand(draft, playerId, newCardId);
  resetCardRuntimeState(draft, newCardId);

  const col = getColumn(draft as GameState, oldColumn);
  const frontKey = playerId === 'p1' ? 'p1Front' : 'p2Front';
  const reserveKey = playerId === 'p1' ? 'p1Reserve' : 'p2Reserve';

  if (oldLocation.zone === 'FRONT') {
    (col as any)[frontKey] = newCardId;
    newCard.zone = 'FRONT';
    newCard.column = oldColumn;
  } else {
    (col as any)[reserveKey] = newCardId;
    newCard.zone = 'RESERVE';
    newCard.column = oldColumn;
    if (hasAbility(draft as GameState, newCardId, 'charge')) {
      promoteFromReserve(draft, newCardId, ctx);
    }
  }

  newCard.exhausted = wasExhausted;
  newCard.attacksThisTurn = wasAttacksThisTurn;
  draft.players[playerId].replacementUsedThisTurn = true;

  ctx.events.push({
    type: 'CARD_REPLACED',
    oldCardId: targetCardId,
    newCardId,
  });

  enqueueTrigger(draft, newCardId, 'ON_REPLACE');

  return { ok: true };
}