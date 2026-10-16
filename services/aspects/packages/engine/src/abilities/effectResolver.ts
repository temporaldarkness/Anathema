import type { WritableDraft } from 'immer';
import type { GameState } from '../types/state';
import type { ResolutionContext } from '../types/resolution';
import type { CardInstanceId, PlayerId, ColumnIndex } from '../types/ids';
import { opponentOf } from '../types/ids';
import type { CardFilter, Effect, TargetSelector, TargetSelection } from '@aspects/cards';
import { cardsInZone, findCardLocation } from '../state/helpers';
import { matchesFilter } from '../state/cardFilter';
import {
  addToHand,
  promoteFromReserve,
  changeInfluence,
  damageGlory,
  healGlory,
  killCard,
} from '../state/mutations';
import { damageCard } from '../state/damage';
import { randomElement, randomIndex } from '../state/rng';
import { summonToken } from '../state/tokens';

export interface EffectContext {
  sourceId: CardInstanceId;
  ownerId: PlayerId;
  attackerId?: CardInstanceId;
}

export function resolveEffect(
  draft: WritableDraft<GameState>,
  effect: Effect,
  ec: EffectContext,
  ctx: ResolutionContext,
  explicitTargets?: CardInstanceId[],
): void {
  switch (effect.kind) {
    case 'DEAL_DAMAGE': {
      const targets = resolveTargets(draft, effect.target, effect.filter, ec, explicitTargets);
      for (const id of targets) {
        if (!draft.cards[id]) continue;
        const r = damageCard(draft, id, effect.amount, ec.sourceId, ctx);
        if (r.killed) killCard(draft, id, ctx);
      }
      break;
    }
    case 'HEAL': {
      const targets = resolveTargets(draft, effect.target, effect.filter, ec, explicitTargets);
      for (const id of targets) {
        const card = draft.cards[id];
        if (!card) continue;
        card.damageTaken = Math.max(0, card.damageTaken - effect.amount);
      }
      break;
    }
    case 'BUFF': {
      const targets = resolveTargets(draft, effect.target, effect.filter, ec, explicitTargets);
      for (const id of targets) {
        const card = draft.cards[id];
        if (!card) continue;
        if (effect.strength !== 0) {
          card.modifiers.push({
            source: `ability:${ec.sourceId}`,
            stat: 'strength',
            delta: effect.strength,
          });
        }
        if (effect.health !== 0) {
          card.modifiers.push({
            source: `ability:${ec.sourceId}`,
            stat: 'health',
            delta: effect.health,
          });
        }
      }
      break;
    }
    case 'GRANT_SHIELD': {
      const targets = resolveTargets(draft, effect.target, effect.filter, ec, explicitTargets);
      for (const id of targets) {
        const card = draft.cards[id];
        if (!card) continue;
        card.shieldAvailable = true;
      }
      break;
    }
    case 'EXHAUST_TARGET': {
      const targets = resolveTargets(draft, effect.target, effect.filter, ec, explicitTargets);
      for (const id of targets) {
        const card = draft.cards[id];
        if (!card) continue;
        if (!card.exhausted) {
          card.exhausted = true;
          ctx.events.push({ type: 'CARD_EXHAUSTED', cardId: id });
        }
      }
      break;
    }
    case 'UNEXHAUST_TARGET': {
      const targets = resolveTargets(draft, effect.target, effect.filter, ec, explicitTargets);
      for (const id of targets) {
        const card = draft.cards[id];
        if (!card) continue;
        if (card.exhausted) {
          card.exhausted = false;
          ctx.events.push({ type: 'CARD_RESTORED', cardId: id });
        }
      }
      break;
    }
    case 'DRAW': {
      const who: PlayerId = effect.who === 'SELF' ? ec.ownerId : opponentOf(ec.ownerId);
      for (let i = 0; i < effect.count; i++) {
        const p = draft.players[who];
        if (p.deck.length > 0) {
          const id = p.deck.shift()!;
          addToHand(draft, who, id);
          ctx.events.push({ type: 'CARD_DRAWN', playerId: who, cardId: id });
        } else if (p.discard.length > 0) {
          const idx = randomIndex(draft, p.discard.length);
          const id = p.discard.splice(idx, 1)[0];
          addToHand(draft, who, id);
          ctx.events.push({ type: 'CARD_DRAWN', playerId: who, cardId: id });
          damageGlory(draft, who, 2, ctx);
        } else {
          damageGlory(draft, who, 2, ctx);
        }
      }
      break;
    }
    case 'GAIN_INFLUENCE': {
      const who: PlayerId = effect.who === 'SELF' ? ec.ownerId : opponentOf(ec.ownerId);
      changeInfluence(draft, who, effect.amount, ctx);
      break;
    }
    case 'SPEND_INFLUENCE': {
      const who: PlayerId = effect.who === 'SELF' ? ec.ownerId : opponentOf(ec.ownerId);
      changeInfluence(draft, who, -effect.amount, ctx);
      break;
    }
    case 'DAMAGE_GLORY': {
      const who: PlayerId = effect.who === 'SELF' ? ec.ownerId : opponentOf(ec.ownerId);
      damageGlory(draft, who, effect.amount, ctx);
      break;
    }
    case 'HEAL_GLORY': {
      const who: PlayerId = effect.who === 'SELF' ? ec.ownerId : opponentOf(ec.ownerId);
      healGlory(draft, who, effect.amount, ctx);
      break;
    }
    case 'CHOOSE_TARGETS_THEN': {
      const eligible = eligibleForSelection(draft, effect.selection, ec);
      if (eligible.length === 0) {
        return;
      }
      const count = Math.min(effect.selection.count, eligible.length);
      draft.pendingChoice = {
        kind: 'EFFECT_TARGET_SELECTION',
        playerId: ec.ownerId,
        count,
        eligibleCardIds: eligible,
        continuation: {
          sourceId: ec.sourceId,
          ownerId: ec.ownerId,
          then: effect.then,
          attackerId: ec.attackerId,
        },
      };
      ctx.events.push({
        type: 'CHOICE_REQUESTED',
        playerId: ec.ownerId,
        kind: 'EFFECT_TARGET_SELECTION',
        count,
      });
      break;
    }
    case 'SUMMON': {
      const who: PlayerId = effect.who === 'SELF' ? ec.ownerId : opponentOf(ec.ownerId);
      const destination = effect.destination ?? 'FRONT';
      for (let i = 0; i < effect.count; i++) {
        summonToken(draft, effect.defId, who, ctx, destination);
      }
      break;
    }
    case 'RETURN_TO_HAND': {
      const targets = resolveTargets(draft, effect.target, effect.filter, ec, explicitTargets);
      for (const id of targets) {
        const card = draft.cards[id];
        if (!card) continue;
        if (card.zone !== 'FRONT' && card.zone !== 'RESERVE') continue;
        if (card.column != null) {
          const col = draft.board[card.column - 1];
          const owner = card.controllerId;
          if (owner === 'p1') {
            if (col.p1Front === id) col.p1Front = null;
            if (col.p1Reserve === id) col.p1Reserve = null;
          } else {
            if (col.p2Front === id) col.p2Front = null;
            if (col.p2Reserve === id) col.p2Reserve = null;
          }
        }
        const wasFront = card.zone === 'FRONT';
        const col = card.column;
        const owner = card.controllerId;
        addToHand(draft, owner, id);
        draft.cards[id].readyForFront = false;
        if (wasFront && col != null) {
          const boardCol = draft.board[col - 1];
          const reserveId = owner === 'p1' ? boardCol.p1Reserve : boardCol.p2Reserve;
          if (reserveId) promoteFromReserve(draft, reserveId, ctx);
        }
      }
      break;
    }

    case 'MOVE_CARD': {
      const targets = resolveTargets(draft, effect.target, effect.filter, ec, explicitTargets);
      for (const id of targets) {
        const card = draft.cards[id];
        if (!card) continue;
        if (card.zone !== 'FRONT' && card.zone !== 'RESERVE') continue;
        if (card.column == null) continue;
        const owner = card.controllerId;
        const fromCol = card.column;
        const fromZone = card.zone;

        let targetCol: number | null = null;
        if (effect.to === 'RANDOM_OWN_EMPTY') {
          const candidates: number[] = [];
          for (let i = 1; i <= 5; i++) {
            if (i === fromCol) continue;
            const c = draft.board[i - 1];
            const slot = owner === 'p1'
              ? (fromZone === 'FRONT' ? c.p1Front : c.p1Reserve)
              : (fromZone === 'FRONT' ? c.p2Front : c.p2Reserve);
            if (slot === null) candidates.push(i);
          }
          if (candidates.length === 0) continue;
          targetCol = candidates[randomIndex(draft, candidates.length)];
        } else if (effect.to === 'OWN_RESERVE') {
          for (let i = 1; i <= 5; i++) {
            const c = draft.board[i - 1];
            const slot = owner === 'p1' ? c.p1Reserve : c.p2Reserve;
            if (slot === null) { targetCol = i; break; }
          }
        }
        if (targetCol == null) continue;

        const fromBoardCol = draft.board[fromCol - 1];
        if (owner === 'p1') {
          if (fromZone === 'FRONT') fromBoardCol.p1Front = null;
          else fromBoardCol.p1Reserve = null;
        } else {
          if (fromZone === 'FRONT') fromBoardCol.p2Front = null;
          else fromBoardCol.p2Reserve = null;
        }

        const toBoardCol = draft.board[targetCol - 1];
        const toZone = effect.to === 'OWN_RESERVE' ? 'RESERVE' : fromZone;
        if (owner === 'p1') {
          if (toZone === 'FRONT') toBoardCol.p1Front = id;
          else toBoardCol.p1Reserve = id;
        } else {
          if (toZone === 'FRONT') toBoardCol.p2Front = id;
          else toBoardCol.p2Reserve = id;
        }
        card.column = targetCol as ColumnIndex;
        card.zone = toZone;
        card.readyForFront = false;

        if (fromZone === 'FRONT') {
          const reserveId = owner === 'p1'
            ? fromBoardCol.p1Reserve
            : fromBoardCol.p2Reserve;
          if (reserveId) promoteFromReserve(draft, reserveId, ctx);
        }
      }
      break;
    }

    case 'MOVE_TO_COLUMN': {
      const targets = resolveTargets(draft, effect.target, effect.filter, ec, explicitTargets);
      for (const id of targets) {
        const card = draft.cards[id];
        if (!card) continue;
        if (card.zone !== 'FRONT' && card.zone !== 'RESERVE') continue;
        if (card.column == null) continue;
        const fromCol = card.column;
        if (fromCol === effect.column) continue;

        const owner = card.controllerId;
        const zone = card.zone;
        const slotKey: 'p1Front' | 'p1Reserve' | 'p2Front' | 'p2Reserve' =
          owner === 'p1'
            ? (zone === 'FRONT' ? 'p1Front' : 'p1Reserve')
            : (zone === 'FRONT' ? 'p2Front' : 'p2Reserve');

        const fromBoardCol = draft.board[fromCol - 1];
        const toBoardCol = draft.board[effect.column - 1];
        if ((toBoardCol as any)[slotKey] !== null) continue;

        (fromBoardCol as any)[slotKey] = null;
        (toBoardCol as any)[slotKey] = id;
        card.column = effect.column as ColumnIndex;
        card.readyForFront = false;

        ctx.events.push({
          type: 'CARD_MOVED',
          cardId: id,
          from: zone,
          to: zone,
          column: effect.column as ColumnIndex,
        });

        if (zone === 'FRONT') {
          const reserveKey = owner === 'p1' ? 'p1Reserve' : 'p2Reserve';
          const reserveId = (fromBoardCol as any)[reserveKey];
          if (reserveId) promoteFromReserve(draft, reserveId, ctx);
        }
      }
      break;
    }

    case 'RETURN_FROM_DISCARD': {
      const who: PlayerId = effect.who === 'SELF' ? ec.ownerId : opponentOf(ec.ownerId);
      const p = draft.players[who];
      for (let i = 0; i < effect.count; i++) {
        if (p.discard.length === 0) break;
        const idx = randomIndex(draft, p.discard.length);
        const cardId = p.discard.splice(idx, 1)[0];
        const card = draft.cards[cardId];
        if (effect.destination === 'HAND') {
          addToHand(draft, who, cardId);
        } else {
          p.deck.unshift(cardId);
          if (card) { card.zone = 'DECK'; card.column = null; }
        }
      }
      break;
    }

    case 'DISCARD_RANDOM': {
      const who: PlayerId = effect.who === 'SELF' ? ec.ownerId : opponentOf(ec.ownerId);
      const p = draft.players[who];
      for (let i = 0; i < effect.count; i++) {
        if (p.hand.length === 0) break;
        const idx = randomIndex(draft, p.hand.length);
        const cardId = p.hand.splice(idx, 1)[0];
        const card = draft.cards[cardId];
        if (card) { card.zone = 'DISCARD'; card.column = null; }
        if (!card?.isToken) p.discard.push(cardId);
        ctx.events.push({ type: 'CARD_DISCARDED', playerId: who, cardId });
      }
      break;
    }

    case 'DISCARD_CHOSEN': {
      const targetPlayer: PlayerId = effect.who === 'SELF' ? ec.ownerId : opponentOf(ec.ownerId);
      const hand = draft.players[targetPlayer].hand;
      if (hand.length === 0) break;
      const count = Math.min(effect.count, hand.length);
      draft.pendingChoice = {
        kind: 'DISCARD_CHOSEN',
        playerId: ec.ownerId,
        targetPlayerId: targetPlayer,
        count,
        eligibleCardIds: [...hand],
      };
      ctx.events.push({
        type: 'CHOICE_REQUESTED',
        playerId: ec.ownerId,
        kind: 'DISCARD_CHOSEN',
        count,
      });
      break;
    }
  }
}

function eligibleForSelection(
  draft: WritableDraft<GameState>,
  selection: TargetSelection,
  ec: EffectContext,
): CardInstanceId[] {
  const state = draft as GameState;
  const enemy = opponentOf(ec.ownerId);

  switch (selection.from) {
    case 'ENEMY_FRONT':
      return cardsInZone(state, enemy, 'FRONT').map((c) => c.instanceId);
    case 'ENEMY_BOARD':
      return [
        ...cardsInZone(state, enemy, 'FRONT'),
        ...cardsInZone(state, enemy, 'RESERVE'),
      ].map((c) => c.instanceId);
    case 'FRIENDLY_FRONT':
      return cardsInZone(state, ec.ownerId, 'FRONT').map((c) => c.instanceId);
    case 'FRIENDLY_BOARD':
      return [
        ...cardsInZone(state, ec.ownerId, 'FRONT'),
        ...cardsInZone(state, ec.ownerId, 'RESERVE'),
      ].map((c) => c.instanceId);
    case 'ANY_FRONT':
      return [
        ...cardsInZone(state, ec.ownerId, 'FRONT'),
        ...cardsInZone(state, enemy, 'FRONT'),
      ].map((c) => c.instanceId);
    case 'ANY_CARD':
      return [
        ...cardsInZone(state, ec.ownerId, 'FRONT'),
        ...cardsInZone(state, ec.ownerId, 'RESERVE'),
        ...cardsInZone(state, enemy, 'FRONT'),
        ...cardsInZone(state, enemy, 'RESERVE'),
      ].map((c) => c.instanceId);
  }
}

function resolveOpposite(
  state: GameState,
  sourceId: CardInstanceId,
): CardInstanceId | null {
  const loc = findCardLocation(state, sourceId);
  if (!loc) return null;
  const col = state.board[loc.column - 1];
  if (!col) return null;

  const oppositeSide = opponentOf(loc.ownerId);
  if (loc.zone === 'FRONT') {
    return oppositeSide === 'p1' ? col.p1Front : col.p2Front;
  }
  return oppositeSide === 'p1' ? col.p1Reserve : col.p2Reserve;
}

function resolveTargets(
  draft: WritableDraft<GameState>,
  selector: TargetSelector,
  filter: CardFilter | undefined,
  ec: EffectContext,
  explicitTargets?: CardInstanceId[],
): CardInstanceId[] {
  const state = draft as GameState;
  const enemy = opponentOf(ec.ownerId);

  const applyFilter = (list: CardInstanceId[]): CardInstanceId[] => {
    if (!filter) return list;
    return list.filter((id) => matchesFilter(state, id, filter));
  };

  switch (selector) {
    case 'SELF':
      return [ec.sourceId];
    case 'CHOSEN':
      return explicitTargets ?? [];
    case 'OWNER_HERO':
    case 'ENEMY_HERO':
      return [];
    case 'OPPOSITE': {
      const opposite = resolveOpposite(state, ec.sourceId);
      if (!opposite) return [];
      return applyFilter([opposite]);
    }
    case 'ALL_FRIENDLY_FRONT':
      return applyFilter(cardsInZone(state, ec.ownerId, 'FRONT').map((c) => c.instanceId));
    case 'ALL_ENEMY_FRONT':
      return applyFilter(cardsInZone(state, enemy, 'FRONT').map((c) => c.instanceId));
    case 'ALL_FRIENDLY_BOARD':
      return applyFilter([
        ...cardsInZone(state, ec.ownerId, 'FRONT'),
        ...cardsInZone(state, ec.ownerId, 'RESERVE'),
      ].map((c) => c.instanceId));
    case 'ALL_ENEMY_BOARD':
      return applyFilter([
        ...cardsInZone(state, enemy, 'FRONT'),
        ...cardsInZone(state, enemy, 'RESERVE'),
      ].map((c) => c.instanceId));
    case 'ALL_CARDS_ON_BOARD': {
      return applyFilter([
        ...cardsInZone(state, ec.ownerId, 'FRONT'),
        ...cardsInZone(state, ec.ownerId, 'RESERVE'),
        ...cardsInZone(state, enemy, 'FRONT'),
        ...cardsInZone(state, enemy, 'RESERVE'),
      ]
        .filter((c) => c.instanceId !== ec.sourceId)
        .map((c) => c.instanceId));
    }
    case 'RANDOM_ENEMY_FRONT': {
      const list = cardsInZone(state, enemy, 'FRONT');
      const filtered = filter
        ? list.filter((c) => matchesFilter(state, c.instanceId, filter))
        : list;
      const pick = randomElement(draft, filtered);
      return pick ? [pick.instanceId] : [];
    }
    case 'RANDOM_FRIENDLY_FRONT': {
      const list = cardsInZone(state, ec.ownerId, 'FRONT');
      const filtered = filter
        ? list.filter((c) => matchesFilter(state, c.instanceId, filter))
        : list;
      const pick = randomElement(draft, filtered);
      return pick ? [pick.instanceId] : [];
    }
    case 'ATTACKER': {
      return ec.attackerId ? [ec.attackerId] : [];
    }
  }
}