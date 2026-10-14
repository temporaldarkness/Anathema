import type { WritableDraft } from 'immer';
import type { GameState } from '../types/state';
import type { ResolutionContext } from '../types/resolution';
import type { CardInstanceId } from '../types/ids';
import { opponentOf } from '../types/ids';
import { columnBonuses, controlledCells, frontCount } from '../state/helpers';
import { addToHand, damageGlory, killCard, promoteFromReserve } from '../state/mutations';
import { queuePhaseTriggers } from '../abilities/triggerEngine';
import { randomIndex } from '../state/rng';

function setPhase(
  draft: WritableDraft<GameState>,
  ctx: ResolutionContext,
  phase: GameState['phase'],
): void {
  draft.phase = phase;
  ctx.events.push({
    type: 'PHASE_CHANGED',
    playerId: draft.activePlayer,
    phase,
  });
}

function doRestore(draft: WritableDraft<GameState>, ctx: ResolutionContext): void {
  const player = draft.activePlayer;
  for (const col of draft.board) {
    const ids: (CardInstanceId | null)[] =
      player === 'p1' ? [col.p1Front, col.p1Reserve] : [col.p2Front, col.p2Reserve];
    for (const id of ids) {
      if (!id) continue;
      const card = draft.cards[id];
      if (card.exhausted) {
        card.exhausted = false;
        ctx.events.push({ type: 'CARD_RESTORED', cardId: id });
      }
    }
  }
}

function doMove(draft: WritableDraft<GameState>, ctx: ResolutionContext): void {
  const player = draft.activePlayer;
  for (let i = 0; i < 5; i++) {
    const col = draft.board[i];
    const reserveId = player === 'p1' ? col.p1Reserve : col.p2Reserve;
    if (!reserveId) continue;
    const card = draft.cards[reserveId];

    if (card.slowCounter > 0) {
      card.slowCounter -= 1;
      continue;
    }

    const frontId = player === 'p1' ? col.p1Front : col.p2Front;
    if (frontId === null) {
      promoteFromReserve(draft, reserveId, ctx);
    } else {
      card.readyForFront = true;
    }
  }
}

function doDraw(draft: WritableDraft<GameState>, ctx: ResolutionContext): void {
  const player = draft.activePlayer;
  const opponent = opponentOf(player);
  const bonuses = columnBonuses(draft as GameState, player);

  let count = 1 + bonuses.extraDraw;
  if (frontCount(draft as GameState, player) < frontCount(draft as GameState, opponent)) {
    count += 1;
  }

  for (let i = 0; i < count; i++) {
    const p = draft.players[player];
    if (p.deck.length > 0) {
      const cardId = p.deck.shift()!;
      addToHand(draft, player, cardId);
      ctx.events.push({ type: 'CARD_DRAWN', playerId: player, cardId });
    } else if (p.discard.length > 0) {
      const idx = randomIndex(draft, p.discard.length);
      const cardId = p.discard.splice(idx, 1)[0];
      addToHand(draft, player, cardId);
      ctx.events.push({ type: 'CARD_DRAWN', playerId: player, cardId });
      damageGlory(draft, player, 2, ctx);
    } else {
      damageGlory(draft, player, 2, ctx);
    }
  }
}

function doInfluence(draft: WritableDraft<GameState>, ctx: ResolutionContext): void {
  const player = draft.activePlayer;
  const opponent = opponentOf(player);
  const bonuses = columnBonuses(draft as GameState, player);

  let delta = 1 + bonuses.influenceBonus;
  if (controlledCells(draft as GameState, player) < controlledCells(draft as GameState, opponent)) {
    delta += 1;
  }

  const p = draft.players[player];
  const before = p.influence;
  const after = Math.min(10, before + delta);
  p.influence = after;
  if (after !== before) {
    ctx.events.push({
      type: 'INFLUENCE_CHANGED',
      playerId: player,
      delta: after - before,
      total: after,
    });
  }
}

function doEndOfTurnStart(draft: WritableDraft<GameState>, ctx: ResolutionContext): void {
  const player = draft.activePlayer;

  queuePhaseTriggers(draft, 'ON_TURN_END', player, ctx);
  
  const toDestroy: CardInstanceId[] = [];
  for (const col of draft.board) {
    const ids = player === 'p1'
      ? [col.p1Front, col.p1Reserve]
      : [col.p2Front, col.p2Reserve];
    for (const id of ids) {
      if (!id) continue;
      const card = draft.cards[id];
      if (!card || card.tempTurnsLeft == null) continue;
      card.tempTurnsLeft -= 1;
      if (card.tempTurnsLeft <= 0) {
        toDestroy.push(id);
      }
    }
  }
  for (const id of toDestroy) {
    killCard(draft, id, ctx);
  }

  const hand = draft.players[player].hand;
  if (hand.length > 10) {
    const excess = hand.length - 10;
    draft.pendingChoice = {
      kind: 'END_TURN_DISCARD',
      playerId: player,
      count: excess,
      eligibleCardIds: [...hand],
    };
    ctx.events.push({
      type: 'CHOICE_REQUESTED',
      playerId: player,
      kind: 'END_TURN_DISCARD',
      count: excess,
    });
    return;
  }
}

function doEndOfTurnFinish(draft: WritableDraft<GameState>, ctx: ResolutionContext): void {
  const player = draft.activePlayer;
  if (draft.players[player].glory < 10) {
    for (let i = 0; i < 5; i++) {
      const col = draft.board[i];
      const reserveId = player === 'p1' ? col.p1Reserve : col.p2Reserve;
      if (reserveId) promoteFromReserve(draft, reserveId, ctx);
    }
  }
}

function checkAltVictory(draft: WritableDraft<GameState>, ctx: ResolutionContext): void {
  const p = draft.activePlayer;
  const all = controlledCells(draft as GameState, p) === 5;
  if (all) {
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
}

export function processTemporaryCards(
  draft: WritableDraft<GameState>,
  ctx: ResolutionContext,
): void {
  const active = draft.activePlayer;
  const toDestroy: CardInstanceId[] = [];
  for (const col of draft.board) {
    const ids =
      active === 'p1'
        ? [col.p1Front, col.p1Reserve]
        : [col.p2Front, col.p2Reserve];
    for (const id of ids) {
      if (!id) continue;
      const card = draft.cards[id];
      if (!card || card.tempTurnsLeft == null) continue;
      card.tempTurnsLeft -= 1;
      if (card.tempTurnsLeft <= 0) toDestroy.push(id);
    }
  }
  for (const id of toDestroy) killCard(draft, id, ctx);
}

export function advanceTurn(
  draft: WritableDraft<GameState>,
  ctx: ResolutionContext,
): void {
  processTemporaryCards(draft, ctx);

  draft.activePlayer = opponentOf(draft.activePlayer);
  draft.turnNumber += 1;
  draft.players[draft.activePlayer].replacementUsedThisTurn = false;
  draft.players[draft.activePlayer].cardsPlayedThisTurn = 0;

  const p = draft.activePlayer;
  for (const id of Object.keys(draft.cards) as CardInstanceId[]) {
    const card = draft.cards[id];
    if (card.ownerId !== p) continue;
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
  checkAltVictory(draft, ctx);
}

export function advancePhaseInternal(
  draft: WritableDraft<GameState>,
  ctx: ResolutionContext,
): void {
  let safety = 30;

  while (safety-- > 0) {
    if (draft.winner) return;
    if (draft.pendingChoice) return;

    switch (draft.phase) {
      case 'RESTORE': {
        doRestore(draft, ctx);
        setPhase(draft, ctx, 'MOVE');
        break;
      }
      case 'MOVE': {
        doMove(draft, ctx);
        setPhase(draft, ctx, 'DRAW');
        break;
      }
      case 'DRAW': {
        doDraw(draft, ctx);
        setPhase(draft, ctx, 'INFLUENCE');
        break;
      }
      case 'INFLUENCE': {
        doInfluence(draft, ctx);
        setPhase(draft, ctx, 'PLAY');
        return;
      }
      case 'PLAY': {
        setPhase(draft, ctx, 'COMBAT');
        return;
      }
      case 'COMBAT': {
        setPhase(draft, ctx, 'END');
        break;
      }
      case 'END': {
        doEndOfTurnStart(draft, ctx);
        if (draft.pendingChoice) return;
        doEndOfTurnFinish(draft, ctx);
        advanceTurn(draft, ctx);
        break;
      }
    }
  }
}