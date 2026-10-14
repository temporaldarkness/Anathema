export type CardInstanceId = string & { readonly __brand: 'CardInstanceId' };
export type PlayerId = 'p1' | 'p2';
export type ColumnIndex = 1 | 2 | 3 | 4 | 5;

export const PLAYER_IDS: readonly PlayerId[] = ['p1', 'p2'] as const;
export const COLUMN_INDEXES: readonly ColumnIndex[] = [1, 2, 3, 4, 5] as const;

export function asCardInstanceId(s: string): CardInstanceId {
  return s as CardInstanceId;
}

export function opponentOf(id: PlayerId): PlayerId {
  return id === 'p1' ? 'p2' : 'p1';
}