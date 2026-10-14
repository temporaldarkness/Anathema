import type { WritableDraft } from 'immer';
import type { GameState } from '../types/state';
import type { ResolutionContext } from '../types/resolution';
import type { CardInstanceId, ColumnIndex, PlayerId } from '../types/ids';
import { columnBonuses } from '../state/helpers';
import { changeInfluence, removeFromHand, promoteFromReserve, resetCardRuntimeState } from '../state/mutations';
import { enqueueTrigger } from '../state/triggerEnqueue';
import { personalityOnBoard } from '../state/helpers';

export interface PlayCardParams {
  playerId: PlayerId;
  cardId: CardInstanceId;
  column: ColumnIndex;
}

export function playCardInternal(
  draft: WritableDraft<GameState>,
  params: PlayCardParams,
  ctx: ResolutionContext,
): { ok: true } | { ok: false; reason: string } {
  const { playerId, cardId, column } = params;

  if (draft.activePlayer !== playerId) return { ok: false, reason: 'not_your_turn' };
  if (draft.phase !== 'PLAY') return { ok: false, reason: 'not_play_phase' };
  if (!draft.players[playerId].hand.includes(cardId)) return { ok: false, reason: 'card_not_in_hand' };

  const card = draft.cards[cardId];
  const def = draft.definitions[card.definitionId];
  if (!def) return { ok: false, reason: 'unknown_definition' };

  const col = draft.board[column - 1];
  const reserveKey = playerId === 'p1' ? 'p1Reserve' : 'p2Reserve';
  if ((col as any)[reserveKey] !== null) return { ok: false, reason: 'reserve_slot_occupied' };
  
  if (personalityOnBoard(draft as GameState, playerId, def.personalityTag)) {
	return { ok: false, reason: 'duplicate_personality' };
  }

  const bonuses = columnBonuses(draft as GameState, playerId);
  const cost = Math.max(0, def.cost - bonuses.costReduction);
  if (draft.players[playerId].influence < cost) return { ok: false, reason: 'not_enough_influence' };

  if (cost > 0) changeInfluence(draft, playerId, -cost, ctx);

  removeFromHand(draft, playerId, cardId);
  resetCardRuntimeState(draft, cardId);
  const dCard = draft.cards[cardId];
  dCard.zone = 'RESERVE';
  dCard.column = column;
  resetCardRuntimeState(draft, cardId);
  dCard.readyForFront = false;
  (col as any)[reserveKey] = cardId;

  ctx.events.push({ type: 'CARD_PLAYED', playerId, cardId, column });

  enqueueTrigger(draft, cardId, 'ON_ENTER');

  const hasCharge = def.abilities.includes('charge');
  const hasVanguard = def.abilities.includes('vanguard');
  const controlsCell = col.neutralOwner === playerId;
  if (hasCharge || (hasVanguard && controlsCell)) {
    promoteFromReserve(draft, cardId, ctx);
  }

  return { ok: true };
}