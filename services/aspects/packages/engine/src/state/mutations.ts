import type { WritableDraft } from 'immer';
import type { GameState, CardInstance } from '../types/state';
import type { ResolutionContext } from '../types/resolution';
import type { CardInstanceId, PlayerId } from '../types/ids';
import type { ColumnIndex } from '../types/ids';
import { opponentOf } from '../types/ids';
import { enqueueTrigger } from './triggerEnqueue';
import { notifyAllyDied } from '../abilities/reactions';

export function placeCard(
  draft: WritableDraft<GameState>,
  cardId: CardInstanceId,
  zone: 'DECK' | 'HAND' | 'DISCARD' | 'RESERVE' | 'FRONT',
  column: number | null = null,
): void {
  const card = draft.cards[cardId] as WritableDraft<CardInstance>;
  card.zone = zone;
  card.column = column as any;
}

export function removeFromHand(
  draft: WritableDraft<GameState>,
  playerId: PlayerId,
  cardId: CardInstanceId,
): void {
  const hand = draft.players[playerId].hand;
  const idx = hand.indexOf(cardId);
  if (idx < 0) throw new Error(`Card ${cardId} not in hand of ${playerId}`);
  hand.splice(idx, 1);
}

/**
 * Добавляет карту в руку и энкьюит ON_CARD_DRAWN на всех карт
 * игрока во Фронте. Триггерится на любой источник добора
 * (фаза DRAW, эффект DRAW, RETURN_TO_HAND, RETURN_FROM_DISCARD и т.д.).
 */
export function addToHand(
  draft: WritableDraft<GameState>,
  playerId: PlayerId,
  cardId: CardInstanceId,
): void {
  draft.players[playerId].hand.push(cardId);
  const card = draft.cards[cardId] as WritableDraft<CardInstance>;
  card.zone = 'HAND';
  card.column = null;

  for (const col of draft.board) {
    const id = playerId === 'p1' ? col.p1Front : col.p2Front;
    if (id) enqueueTrigger(draft, id, 'ON_CARD_DRAWN');
  }
}

export function addToDiscard(
  draft: WritableDraft<GameState>,
  playerId: PlayerId,
  cardId: CardInstanceId,
): void {
  draft.players[playerId].discard.push(cardId);
  const card = draft.cards[cardId] as WritableDraft<CardInstance>;
  card.zone = 'DISCARD';
  card.column = null;
}

export function changeInfluence(
  draft: WritableDraft<GameState>,
  playerId: PlayerId,
  delta: number,
  ctx: ResolutionContext,
): void {
  const player = draft.players[playerId];
  const before = player.influence;
  const after = Math.min(10, Math.max(0, before + delta));
  player.influence = after;
  if (after !== before) {
    ctx.events.push({
      type: 'INFLUENCE_CHANGED',
      playerId,
      delta: after - before,
      total: after,
    });
  }
}

export function damageGlory(
  draft: WritableDraft<GameState>,
  playerId: PlayerId,
  amount: number,
  ctx: ResolutionContext,
): void {
  if (amount <= 0) return;
  const player = draft.players[playerId];
  player.glory = Math.max(0, player.glory - amount);
  ctx.events.push({
    type: 'GLORY_CHANGED',
    playerId,
    delta: -amount,
    total: player.glory,
  });
  if (player.glory <= 0 && !draft.winner) {
    draft.winner = opponentOf(playerId);
    draft.winnerReason = 'glory_zero';
    ctx.events.push({
      type: 'GAME_OVER',
      winner: opponentOf(playerId),
      reason: 'glory_zero',
    });
  }
}

export function healGlory(
  draft: WritableDraft<GameState>,
  playerId: PlayerId,
  amount: number,
  ctx: ResolutionContext,
): void {
  if (amount <= 0) return;
  const player = draft.players[playerId];
  const before = player.glory;
  player.glory = Math.min(25, before + amount);
  if (player.glory !== before) {
    ctx.events.push({
      type: 'GLORY_CHANGED',
      playerId,
      delta: player.glory - before,
      total: player.glory,
    });
  }
}

export function killCardNoExit(
  draft: WritableDraft<GameState>,
  cardId: CardInstanceId,
): { wasFront: boolean; column: ColumnIndex | null; owner: PlayerId | null } {
  const card = draft.cards[cardId];
  if (!card) return { wasFront: false, column: null, owner: null };

  const wasFront = card.zone === 'FRONT';
  const column = card.column;
  const owner = card.ownerId;

  if (card.column != null) {
    const col = draft.board[card.column - 1];
    if (owner === 'p1') {
      if (col.p1Front === cardId) col.p1Front = null;
      if (col.p1Reserve === cardId) col.p1Reserve = null;
    } else {
      if (col.p2Front === cardId) col.p2Front = null;
      if (col.p2Reserve === cardId) col.p2Reserve = null;
    }
  }
  resetCardRuntimeState(draft, cardId);
  card.zone = 'DISCARD';
  card.column = null;

  if (!card.isToken) {
    draft.players[owner].discard.push(cardId);
  }

  return { wasFront, column, owner };
}

export function killCard(
  draft: WritableDraft<GameState>,
  cardId: CardInstanceId,
  ctx: ResolutionContext,
): void {
  const card = draft.cards[cardId];
  if (!card) return;
  ctx.events.push({ type: 'CARD_DIED', cardId, zone: card.zone });

  notifyAllyDied(draft, cardId);
  const info = killCardNoExit(draft, cardId);
  enqueueTrigger(draft, cardId, 'ON_EXIT');

  if (info.wasFront && info.column != null && info.owner) {
    const col = draft.board[info.column - 1];
    const reserveId = info.owner === 'p1' ? col.p1Reserve : col.p2Reserve;
    if (reserveId) {
      const reserveCard = draft.cards[reserveId];
      if (reserveCard && reserveCard.readyForFront) {
        promoteFromReserve(draft, reserveId, ctx);
      }
    }
  }
}

export function promoteFromReserve(
  draft: WritableDraft<GameState>,
  cardId: CardInstanceId,
  ctx: ResolutionContext,
): boolean {
  const card = draft.cards[cardId];
  if (!card) return false;
  if (card.zone !== 'RESERVE') return false;
  if (card.column == null) return false;

  const col = draft.board[card.column - 1];
  const owner = card.controllerId;
  const frontKey = owner === 'p1' ? 'p1Front' : 'p2Front';
  const reserveKey = owner === 'p1' ? 'p1Reserve' : 'p2Reserve';
  if ((col as any)[frontKey] !== null) return false;

  (col as any)[frontKey] = cardId;
  (col as any)[reserveKey] = null;
  card.zone = 'FRONT';
  card.readyForFront = false;

  ctx.events.push({
    type: 'CARD_MOVED',
    cardId,
    from: 'RESERVE',
    to: 'FRONT',
    column: card.column,
  });

  enqueueTrigger(draft, cardId, 'ON_REINFORCE');
  return true;
}

export function resetCardRuntimeState(
  draft: WritableDraft<GameState>,
  cardId: CardInstanceId,
): void {
  const card = draft.cards[cardId];
  if (!card) return;
  const def = draft.definitions[card.definitionId];
  card.damageTaken = 0;
  card.modifiers = [];
  card.exhausted = def?.entersExhausted ?? false;
  card.shieldAvailable = def ? (def.abilities ?? []).includes('shield') : false;
  card.slowCounter = def && (def.abilities ?? []).includes('slow') ? 1 : 0;
  card.usedAbilitiesThisTurn = [];
  card.usedTriggerIdsThisTurn = [];
  card.attacksThisTurn = 0;
  card.readyForFront = false;
  card.tempTurnsLeft = def ? (def.tempDuration ?? null) : null;
  card.turnsOnBoard = 0;
  card.silenced = false;
}