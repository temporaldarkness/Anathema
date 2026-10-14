import type { WritableDraft } from 'immer';
import type { GameState } from '../types/state';
import { mulberry32Next } from '../rng/mulberry';

export function rollRng(draft: WritableDraft<GameState>): number {
  const { next, value } = mulberry32Next(draft.rngState);
  draft.rngState = next;
  return value;
}

export function randomIndex(draft: WritableDraft<GameState>, max: number): number {
  if (max <= 0) return 0;
  return Math.floor(rollRng(draft) * max);
}

export function randomElement<T>(
  draft: WritableDraft<GameState>,
  arr: readonly T[],
): T | null {
  if (arr.length === 0) return null;
  return arr[randomIndex(draft, arr.length)];
}