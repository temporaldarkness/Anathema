import type { GameState, CardInstance, PlayerState, Column } from '../types/state';
import type { CardInstanceId, ColumnIndex, PlayerId } from '../types/ids';
import type { TriggeredAbility, KeywordId } from '@aspects/cards';
import { COLUMN_INDEXES, opponentOf } from '../types/ids';

export function getCard(state: GameState, id: CardInstanceId): CardInstance {
  const c = state.cards[id];
  if (!c) throw new Error(`Card not found: ${id}`);
  return c;
}

export function getPlayer(state: GameState, id: PlayerId): PlayerState {
  return state.players[id];
}

export function getOpponent(state: GameState, id: PlayerId): PlayerState {
  return state.players[opponentOf(id)];
}

/**
 * Активные ключевые слова карты с учётом silence.
 * Silenced карта теряет все keywords.
 */
export function cardAbilities(state: GameState, cardId: CardInstanceId): readonly KeywordId[] {
  const card = state.cards[cardId];
  if (!card) return [];
  if (card.silenced) return [];
  const def = state.definitions[card.definitionId];
  return def?.abilities ?? [];
}

/**
 * Активные триггеры карты с учётом silence.
 * Silenced карта теряет все triggers.
 */
export function cardTriggers(state: GameState, cardId: CardInstanceId): readonly TriggeredAbility[] {
  const card = state.cards[cardId];
  if (!card) return [];
  if (card.silenced) return [];
  const def = state.definitions[card.definitionId];
  return def?.triggers ?? [];
}

export function health(card: CardInstance): number {
  let total = card.baseHealth - card.damageTaken;
  for (const m of card.modifiers) {
    if (m.stat === 'health') total += m.delta;
  }
  return total;
}

export function strength(card: CardInstance): number {
  let total = card.baseStrength;
  for (const m of card.modifiers) {
    if (m.stat === 'strength') total += m.delta;
  }
  return Math.max(0, total);
}

export function strengthInBattle(state: GameState, cardId: CardInstanceId): number {
  const card = state.cards[cardId];
  if (!card) return 0;
  let s = strength(card);
  if (card.zone === 'FRONT') {
    const bonuses = columnBonuses(state, card.ownerId);
    s += bonuses.strengthBonus;
  }
  return Math.max(0, s);
}

export function columnByIndex(state: GameState, index: number): Column {
  if (index < 0 || index >= 5) throw new Error(`Column index out of range: ${index}`);
  return state.board[index];
}

export function getColumn(state: GameState, column: ColumnIndex): Column {
  return state.board[column - 1];
}

export interface CardLocation {
  column: ColumnIndex;
  zone: 'FRONT' | 'RESERVE';
  ownerId: PlayerId;
}

export function findCardLocation(
  state: GameState,
  cardId: CardInstanceId,
): CardLocation | null {
  for (const col of COLUMN_INDEXES) {
    const c = state.board[col - 1];
    if (c.p1Front === cardId) return { column: col, zone: 'FRONT', ownerId: 'p1' };
    if (c.p1Reserve === cardId) return { column: col, zone: 'RESERVE', ownerId: 'p1' };
    if (c.p2Front === cardId) return { column: col, zone: 'FRONT', ownerId: 'p2' };
    if (c.p2Reserve === cardId) return { column: col, zone: 'RESERVE', ownerId: 'p2' };
  }
  return null;
}

export function cardsInZone(
  state: GameState,
  playerId: PlayerId,
  zone: 'DECK' | 'HAND' | 'DISCARD' | 'FRONT' | 'RESERVE',
): CardInstance[] {
  const player = state.players[playerId];
  switch (zone) {
    case 'DECK':
      return player.deck.map((id) => state.cards[id]);
    case 'HAND':
      return player.hand.map((id) => state.cards[id]);
    case 'DISCARD':
      return player.discard.map((id) => state.cards[id]);
    case 'FRONT':
    case 'RESERVE': {
      const out: CardInstance[] = [];
      for (const col of state.board) {
        const id =
          playerId === 'p1'
            ? zone === 'FRONT'
              ? col.p1Front
              : col.p1Reserve
            : zone === 'FRONT'
              ? col.p2Front
              : col.p2Reserve;
        if (id) out.push(state.cards[id]);
      }
      return out;
    }
  }
}

export function frontCount(state: GameState, playerId: PlayerId): number {
  return cardsInZone(state, playerId, 'FRONT').length;
}

export function reserveCount(state: GameState, playerId: PlayerId): number {
  return cardsInZone(state, playerId, 'RESERVE').length;
}

export function controlledCells(state: GameState, playerId: PlayerId): number {
  let n = 0;
  for (const col of state.board) {
    if (col.neutralOwner === playerId) n++;
  }
  return n;
}

export function controlsAllCells(state: GameState, playerId: PlayerId): boolean {
  return controlledCells(state, playerId) === 5;
}

export interface ColumnBonuses {
  costReduction: number;
  strengthBonus: number;
  influenceBonus: number;
  damageReduction: number;
  extraDraw: number;
}

export function columnBonuses(state: GameState, playerId: PlayerId): ColumnBonuses {
  return {
    costReduction: state.board[0].neutralOwner === playerId ? 1 : 0,
    strengthBonus: state.board[1].neutralOwner === playerId ? 1 : 0,
    influenceBonus: state.board[2].neutralOwner === playerId ? 1 : 0,
    damageReduction: state.board[3].neutralOwner === playerId ? 1 : 0,
    extraDraw: state.board[4].neutralOwner === playerId ? 1 : 0,
  };
}

export function personalityOnBoard(
  state: GameState,
  playerId: PlayerId,
  personalityTag: string,
): boolean {
  for (const col of state.board) {
    const ids =
      playerId === 'p1' ? [col.p1Front, col.p1Reserve] : [col.p2Front, col.p2Reserve];
    for (const id of ids) {
      if (!id) continue;
      const card = state.cards[id];
      if (!card) continue;
      if (!card.sharesIdentity) continue;
      const def = state.definitions[card.definitionId];
      if (def?.personalityTag === personalityTag) return true;
    }
  }
  return false;
}

export function findCardById(
  state: GameState,
  id: string,
): CardInstance | undefined {
  return state.cards[id as CardInstanceId];
}

export function allCardIds(state: GameState): CardInstanceId[] {
  return Object.keys(state.cards) as CardInstanceId[];
}

export function maxAttacksFor(state: GameState, cardId: CardInstanceId): number {
  const card = state.cards[cardId];
  if (!card) return 0;
  const abilities = cardAbilities(state, cardId);
  return abilities.includes('frenzy') ? 2 : 1;
}

export function canAttackMore(state: GameState, cardId: CardInstanceId): boolean {
  const card = state.cards[cardId];
  if (!card) return false;
  if (card.exhausted) return false;
  return card.attacksThisTurn < maxAttacksFor(state, cardId);
}