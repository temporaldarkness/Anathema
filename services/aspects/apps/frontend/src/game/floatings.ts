import type { PlayerId } from '@aspects/engine';

export interface Floating {
  id: number;
  position: string;
  text: string;
  color: string;
}

export function positionKey(
  column: number | null,
  owner: PlayerId,
  zone: 'FRONT' | 'RESERVE' | 'HAND' | 'DECK' | 'DISCARD',
): string | null {
  if (column == null) return null;
  if (zone !== 'FRONT' && zone !== 'RESERVE') return null;
  return `${column}:${owner}:${zone}`;
}

/** Ключ для floating на панели игрока (гильдия). */
export function guildKey(ownerId: PlayerId): string {
  return `guild:${ownerId}`;
}