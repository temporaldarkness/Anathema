import type { GameEvent, GameState } from '@aspects/engine';
import type { CardInstanceId, PlayerId } from '@aspects/engine';
import { findCardById } from '@aspects/engine';

export type LogKind =
  | 'turn'
  | 'play'
  | 'damage'
  | 'death'
  | 'capture'
  | 'choice'
  | 'glory'
  | 'summon'
  | 'gameover'
  | 'error';

export interface LogEntry {
  id: number;
  kind: LogKind;
  playerId?: PlayerId;
  text: string;
}

function cardName(state: GameState, cardId: CardInstanceId): string {
  const card = state.cards[cardId];
  if (!card) return '?';
  return state.definitions[card.definitionId]?.name ?? card.definitionId;
}

let nextId = 1;
export function resetLogIdCounter(): void {
  nextId = 1;
}

export function formatEvent(
  state: GameState,
  e: GameEvent,
): Omit<LogEntry, 'id'> | null {
  switch (e.type) {
    case 'TURN_STARTED':
      return { kind: 'turn', playerId: e.playerId, text: `— Ход ${e.turnNumber}: ${e.playerId.toUpperCase()} —` };

    case 'PHASE_CHANGED':
      return null;

    case 'INFLUENCE_CHANGED':
      return {
        kind: 'glory',
        playerId: e.playerId,
        text: `${e.playerId.toUpperCase()}: Влияние +${e.delta} → ${e.total}`,
      };

    case 'GLORY_CHANGED':
      return {
        kind: 'glory',
        playerId: e.playerId,
        text: `💥 ${e.playerId.toUpperCase()}: Величие ${e.total}`,
      };

    case 'CARD_PLAYED':
      return {
        kind: 'play',
        playerId: e.playerId,
        text: `${e.playerId.toUpperCase()} разыгрывает ${cardName(state, e.cardId)}`,
      };

    case 'CARD_DRAWN':
      return {
        kind: 'play',
        playerId: e.playerId,
        text: `🃏 ${e.playerId.toUpperCase()} берёт карту`,
      };

    case 'CARD_DISCARDED':
      return {
        kind: 'play',
        playerId: e.playerId,
        text: `🗑 ${e.playerId.toUpperCase()} сбрасывает карту`,
      };

    case 'CARD_DIED':
      return {
        kind: 'death',
        text: `💀 ${cardName(state, e.cardId)} погибает`,
      };

    case 'CARD_REPLACED':
      return {
        kind: 'play',
        text: `🔄 Замена: ${cardName(state, e.oldCardId)} → ${cardName(state, e.newCardId)}`,
      };

    case 'DAMAGE_DEALT': {
      const src = findCardById(state, e.source);
      const srcName = src ? (state.definitions[src.definitionId]?.name ?? e.source) : e.source;
      return {
        kind: 'damage',
        text: `⚔ ${srcName} наносит ${e.amount} урона → ${cardName(state, e.targetId)}`,
      };
    }

    case 'SHIELD_ABSORBED':
      return {
        kind: 'damage',
        text: `🛡 ${cardName(state, e.cardId)}: урон поглощён щитом`,
      };

    case 'DAMAGE_ABSORBED':
      return {
        kind: 'damage',
        text: `🛡 ${cardName(state, e.targetId)}: ${e.absorbed} урона поглощено защитой`,
      };

    case 'NEUTRAL_CAPTURED':
      return {
        kind: 'capture',
        playerId: e.playerId,
        text: `🚩 ${e.playerId.toUpperCase()} захватывает колонку ${e.column}`,
      };

    case 'NEUTRAL_LOST':
      return {
        kind: 'capture',
        playerId: e.formerOwner,
        text: `⚑ ${e.formerOwner.toUpperCase()} теряет колонку ${e.column}`,
      };

    case 'TOKEN_SUMMONED':
      return {
        kind: 'summon',
        playerId: e.ownerId,
        text: `✨ ${state.definitions[e.defId]?.name ?? e.defId} призван${
          e.column != null ? ` (кол.${e.column})` : ''
        }`,
      };

    case 'TOKEN_LOST':
      return {
        kind: 'summon',
        playerId: e.ownerId,
        text: `⚠ Токен ${state.definitions[e.defId]?.name ?? e.defId} потерян: ${e.reason}`,
      };

    case 'CHOICE_REQUESTED':
      return {
        kind: 'choice',
        playerId: e.playerId,
        text:
          e.kind === 'END_TURN_DISCARD'
            ? `❓ ${e.playerId.toUpperCase()} сбрасывает ${e.count} карт`
            : `❓ ${e.playerId.toUpperCase()} выбирает цель (${e.count})`,
      };

    case 'CHOICE_RESOLVED':
      return { kind: 'choice', playerId: e.playerId, text: `✔ Выбор сделан` };

    case 'MULLIGAN_DONE':
      return {
        kind: 'turn',
        playerId: e.playerId,
        text: `🎴 ${e.playerId.toUpperCase()} ${
          e.replaced ? 'заменил карту' : 'оставил руку'
        }`,
      };

    case 'GAME_OVER':
      return { kind: 'gameover', text: `🏆 Победа: ${e.winner.toUpperCase()} (${e.reason})` };

    case 'COMMAND_REJECTED':
      return { kind: 'error', playerId: e.playerId, text: `❌ Отказ: ${e.reason}` };

    default:
      return null;
  }
}

export function makeLogEntry(state: GameState, e: GameEvent): LogEntry | null {
  const base = formatEvent(state, e);
  if (!base) return null;
  return { id: nextId++, ...base };
}