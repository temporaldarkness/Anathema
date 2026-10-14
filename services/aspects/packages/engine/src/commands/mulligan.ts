import type { WritableDraft } from 'immer';
import type { GameState } from '../types/state';
import type { ResolutionContext } from '../types/resolution';
import type { CardInstanceId, PlayerId } from '../types/ids';
import { randomIndex } from '../state/rng';

export interface MulliganParams {
  playerId: PlayerId;
  cardId: CardInstanceId | null;
}

export function mulliganInternal(
  draft: WritableDraft<GameState>,
  params: MulliganParams,
  ctx: ResolutionContext,
): { ok: true } | { ok: false; reason: string } {
  const { playerId, cardId } = params;

  if (draft.phase !== 'MULLIGAN') {
    return { ok: false, reason: 'not_mulligan_phase' };
  }
  if (draft.mulliganDone[playerId]) {
    return { ok: false, reason: 'mulligan_already_done' };
  }

  if (cardId !== null) {
    const hand = draft.players[playerId].hand;
    if (!hand.includes(cardId)) {
      return { ok: false, reason: 'card_not_in_hand' };
    }

    const idx = hand.indexOf(cardId);
    hand.splice(idx, 1);
    const oldCard = draft.cards[cardId];
    oldCard.zone = 'DECK';
    oldCard.column = null;

    const deck = draft.players[playerId].deck;
    deck.push(cardId);

    const newIdx = randomIndex(draft, deck.length);
    const newCardId = deck.splice(newIdx, 1)[0];
    hand.push(newCardId);
    const newCard = draft.cards[newCardId];
    newCard.zone = 'HAND';
    newCard.column = null;

    draft.mulliganReplaced[playerId] += 1;

    ctx.events.push({
      type: 'MULLIGAN_DONE',
      playerId,
      replaced: true,
    });
  } else {
    ctx.events.push({
      type: 'MULLIGAN_DONE',
      playerId,
      replaced: false,
    });
  }

  draft.mulliganDone[playerId] = true;

  if (draft.mulliganDone.p1 && draft.mulliganDone.p2) {
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
  }

  return { ok: true };
}