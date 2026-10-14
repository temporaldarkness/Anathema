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
  let oldCardId: CardInstanceId | null = null;
  let oldLocation: ReturnType<typeof findCardLocation> = null;

  for (const col of draft.board) {
    const keys: ('p1Front' | 'p1Reserve' | 'p2Front' | 'p2Reserve')[] =
      playerId === 'p1' ? ['p1Front', 'p1Reserve'] : ['p2Front', 'p2Reserve'];
    for (const k of keys) {
      const id = col[k];
      if (!id) continue;
      const c = draft.cards[id];
      const def = draft.definitions[c.definitionId];
      if (def && def.personalityTag === personality) {
        oldCardId = id;
        oldLocation = findCardLocation(draft as GameState, id);
        break;
      }
    }
    if (oldCardId) break;
  }

  if (!oldCardId || !oldLocation) return { ok: false, reason: 'no_matching_card_on_board' };

  const cost = Math.max(0, newDef.cost - columnBonuses(draft as GameState, playerId).costReduction);
  if (draft.players[playerId].influence < cost) return { ok: false, reason: 'not_enough_influence' };
  if (cost > 0) changeInfluence(draft, playerId, -cost, ctx);

  const wasExhausted = draft.cards[oldCardId].exhausted;
  const oldColumn = oldLocation.column;

  killCardNoExit(draft, oldCardId);

  removeFromHand(draft, playerId, cardId);
  
  resetCardRuntimeState(draft, cardId);

  const col = getColumn(draft as GameState, oldColumn);
  const frontKey = playerId === 'p1' ? 'p1Front' : 'p2Front';
  const reserveKey = playerId === 'p1' ? 'p1Reserve' : 'p2Reserve';

  if (oldLocation.zone === 'FRONT') {
    (col as any)[frontKey] = cardId;
    newCard.zone = 'FRONT';
    newCard.column = oldColumn;
  } else {
    (col as any)[reserveKey] = cardId;
    newCard.zone = 'RESERVE';
    newCard.column = oldColumn;
    if (hasAbility(draft as GameState, cardId, 'charge')) {
      promoteFromReserve(draft, cardId, ctx);
    }
  }

  newCard.exhausted = wasExhausted;
  draft.players[playerId].replacementUsedThisTurn = true;

  ctx.events.push({ type: 'CARD_REPLACED', oldCardId, newCardId: cardId });

  enqueueTrigger(draft, cardId, 'ON_REPLACE');

  return { ok: true };
}