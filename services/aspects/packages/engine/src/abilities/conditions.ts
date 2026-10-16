import type { WritableDraft } from 'immer';
import type { GameState } from '../types/state';
import type { Condition, Comparator } from '@aspects/cards';
import type { CardInstanceId, PlayerId } from '../types/ids';
import { opponentOf } from '../types/ids';
import { cardsInZone, controlledCells, health, strength } from '../state/helpers';
import { matchesFilter } from '../state/cardFilter';

export function evaluateCondition(
  draft: WritableDraft<GameState>,
  cond: Condition,
  ownerId: PlayerId,
  sourceId: CardInstanceId,
): boolean {
  const state = draft as GameState;

  switch (cond.kind) {
    case 'CELLS': {
      const who = cond.who === 'SELF' ? ownerId : opponentOf(ownerId);
      return compare(controlledCells(state, who), cond.op, cond.value);
    }
    case 'FRONT_COUNT': {
      const who = cond.who === 'SELF' ? ownerId : opponentOf(ownerId);
      const list = cardsInZone(state, who, 'FRONT');
      const n = cond.filter
        ? list.filter((c) => matchesFilter(state, c.instanceId, cond.filter)).length
        : list.length;
      return compare(n, cond.op, cond.value);
    }
    case 'GLORY': {
      const who = cond.who === 'SELF' ? ownerId : opponentOf(ownerId);
      return compare(state.players[who].glory, cond.op, cond.value);
    }
    case 'INFLUENCE': {
      const who = cond.who === 'SELF' ? ownerId : opponentOf(ownerId);
      return compare(state.players[who].influence, cond.op, cond.value);
    }
    case 'HAND_COUNT': {
      const who = cond.who === 'SELF' ? ownerId : opponentOf(ownerId);
      const list = state.players[who].hand;
      const n = cond.filter
        ? list.filter((id) => matchesFilter(state, id, cond.filter)).length
        : list.length;
      return compare(n, cond.op, cond.value);
    }
    case 'SELF_HEALTH': {
      const card = state.cards[sourceId];
      if (!card) return false;
      return compare(health(card), cond.op, cond.value);
    }
    case 'SELF_STRENGTH': {
      const card = state.cards[sourceId];
      if (!card) return false;
      return compare(strength(card), cond.op, cond.value);
    }
    case 'TOTAL_STRENGTH': {
      const who = cond.who === 'SELF' ? ownerId : opponentOf(ownerId);
      const list = cardsInZone(state, who, 'FRONT');
      let total = 0;
      for (const c of list) {
        if (cond.filter && !matchesFilter(state, c.instanceId, cond.filter)) continue;
        total += strength(c);
      }
      return compare(total, cond.op, cond.value);
    }
    case 'TOTAL_HEALTH': {
      const who = cond.who === 'SELF' ? ownerId : opponentOf(ownerId);
      const list = cardsInZone(state, who, 'FRONT');
      let total = 0;
      for (const c of list) {
        if (cond.filter && !matchesFilter(state, c.instanceId, cond.filter)) continue;
        total += health(c);
      }
      return compare(total, cond.op, cond.value);
    }
    case 'IN_RESERVE': {
      const card = state.cards[sourceId];
      if (!card) return false;
      return card.zone === 'RESERVE';
    }
    case 'IN_FRONT': {
      const card = state.cards[sourceId];
      if (!card) return false;
      return card.zone === 'FRONT';
    }
    case 'TURN_NUMBER': {
      return compare(state.turnNumber, cond.op, cond.value);
    }
    case 'IS_FIRST_PLAYER': {
      return state.firstPlayer === ownerId;
    }
    case 'AND':
      return cond.conditions.every((c) => evaluateCondition(draft, c, ownerId, sourceId));
    case 'OR':
      return cond.conditions.some((c) => evaluateCondition(draft, c, ownerId, sourceId));
    case 'NOT':
      return !evaluateCondition(draft, cond.condition, ownerId, sourceId);
  }
}

function compare(actual: number, op: Comparator, value: number): boolean {
  switch (op) {
    case 'AT_LEAST':
      return actual >= value;
    case 'AT_MOST':
      return actual <= value;
    case 'EQUAL':
      return actual === value;
  }
}