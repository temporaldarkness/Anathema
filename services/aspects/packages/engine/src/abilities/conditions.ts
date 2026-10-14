import type { WritableDraft } from 'immer';
import type { GameState } from '../types/state';
import type { Condition, Comparator } from '@aspects/cards';
import type { CardInstanceId, PlayerId } from '../types/ids';
import { opponentOf } from '../types/ids';
import { controlledCells, frontCount, health, strength } from '../state/helpers';

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
      return compare(frontCount(state, who), cond.op, cond.value);
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
      return compare(state.players[who].hand.length, cond.op, cond.value);
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