import { findCardById, type GameState, type GameEvent } from '@aspects/engine';

export function formatEvent(state: GameState, e: GameEvent): string | null {
  switch (e.type) {
    case 'TURN_STARTED':
      return `— Ход ${e.turnNumber}: ${e.playerId.toUpperCase()} —`;
    case 'PHASE_CHANGED':
      return null;
    case 'INFLUENCE_CHANGED':
      return `${e.playerId.toUpperCase()}: Влияние ${e.total >= 0 ? '+' : ''}${e.delta} → ${e.total}`;
    case 'GLORY_CHANGED':
      return `💥 ${e.playerId.toUpperCase()}: Величие ${e.total}`;
    case 'CARD_PLAYED': {
      const def = state.definitions[state.cards[e.cardId]?.definitionId ?? ''];
      return `${e.playerId.toUpperCase()} разыгрывает ${def?.name ?? '?'}`;
    }
    case 'CARD_DIED': {
      const card = state.cards[e.cardId];
      const def = card ? state.definitions[card.definitionId] : null;
      return `💀 ${def?.name ?? '?'} погибает`;
    }
    case 'CARD_REPLACED': {
      const newCard = state.cards[e.newCardId];
      const def = newCard ? state.definitions[newCard.definitionId] : null;
      return `🔄 Замена на ${def?.name ?? '?'}`;
    }
	case 'DAMAGE_ABSORBED': {
      const card = state.cards[e.targetId];
      const def = card ? state.definitions[card.definitionId] : null;
      const label = e.reason === 'shield' ? 'щитом' : 'защитой колонки 4';
      return `🛡 ${def?.name ?? '?'}: урон ${e.absorbed} поглощён ${label}`;
    }
    case 'NEUTRAL_CAPTURED':
      return `🚩 ${e.playerId.toUpperCase()} захватывает колонку ${e.column}`;
    case 'NEUTRAL_LOST':
      return `⚑ ${e.formerOwner.toUpperCase()} теряет колонку ${e.column}`;
    case 'TOKEN_SUMMONED': {
      const def = state.definitions[e.defId];
      return `✨ ${def?.name ?? e.defId} призван (${e.destination}${e.column ? ', кол.' + e.column : ''})`;
    }
    case 'TOKEN_LOST':
      return `⚠ Токен потерян: ${e.reason}`;
    case 'GAME_OVER':
      return `🏆 Победа: ${e.winner.toUpperCase()} (${e.reason})`;
    case 'COMMAND_REJECTED':
      return `❌ Отказ: ${e.reason}`;
    case 'CHOICE_REQUESTED':
      return `❓ ${e.playerId.toUpperCase()} должен сделать выбор (${e.kind})`;
    case 'CHOICE_RESOLVED':
      return `✔ Выбор сделан`;
	    case 'DAMAGE_DEALT': {
      const card = state.cards[e.targetId];
      const def = card ? state.definitions[card.definitionId] : null;
      const src = findCardById(state, e.source);
      const srcDef = src ? state.definitions[src.definitionId] : null;
      const srcName = srcDef?.name ?? e.source;
      return `⚔ ${srcName} наносит ${e.amount} урона → ${def?.name ?? '?'}`;
    }
    case 'ABILITY_TRIGGERED': {
      const card = state.cards[e.cardId];
      const def = card ? state.definitions[card.definitionId] : null;
      return `✨ Срабатывает: ${def?.name ?? '?'} (${e.abilityId})`;
    }
    case 'CARD_DRAWN': {
      const card = state.cards[e.cardId];
      const def = card ? state.definitions[card.definitionId] : null;
      return `🃏 ${e.playerId.toUpperCase()} берёт ${def?.name ?? '?'}`;
    }
    case 'CARD_DISCARDED': {
      const card = state.cards[e.cardId];
      const def = card ? state.definitions[card.definitionId] : null;
      return `🗑 ${e.playerId.toUpperCase()} сбрасывает ${def?.name ?? '?'}`;
    }
    default:
      return null;
  }
}