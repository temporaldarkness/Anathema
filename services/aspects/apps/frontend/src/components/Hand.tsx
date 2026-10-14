import type { GameState, CardInstanceId } from '@aspects/engine';
import { personalityOnBoard, columnBonuses } from '@aspects/engine';
import { HoverTooltip } from './HoverTooltip';
import { CardTooltip } from './CardTooltip';
import { KEYWORD_ICON, KEYWORD_TEXT } from '../game/abilityText';

interface Props {
  state: GameState;
  playerId: 'p1' | 'p2';
  onPlay: (cardId: CardInstanceId) => void;
  onReplace: (cardId: CardInstanceId) => void;
  selectedCardId: CardInstanceId | null;
  disabled?: boolean;
  observe?: boolean;
}

export function Hand({ state, playerId, onPlay, onReplace, selectedCardId, disabled = false, observe = false }: Props) {
  const hand = state.players[playerId].hand;

  if (hand.length === 0) {
    return <div className="hand hand-empty">Рука пуста</div>;
  }

  const canPlayPhase = state.phase === 'PLAY' && state.activePlayer === playerId;
  const influence = state.players[playerId].influence;
  const bonuses = columnBonuses(state, playerId);

  return (
    <div className={`hand hand-owner-${playerId} ${disabled ? 'hand-disabled' : ''}`}>
      {hand.map((cardId) => {
        const card = state.cards[cardId];
        const def = state.definitions[card.definitionId];

        const cost = Math.max(0, def.cost - bonuses.costReduction);
        const hasCopy = personalityOnBoard(state, playerId, def.personalityTag);
        const canAfford = influence >= cost;

        const canPlay = canPlayPhase && canAfford && !hasCopy;
        const canReplace = canPlayPhase && hasCopy && canAfford;
		let reason = '';
		if (!canPlayPhase) {
		  reason = 'Только в фазу разыгрывания';
		} else if (!canAfford) {
		  reason = `Нужно ${cost}💰, есть ${influence}`;
		} else if (hasCopy) {
			reason = '';
		}

        const selected = cardId === selectedCardId;
        const hasActivated = (def.activatedAbilities?.length ?? 0) > 0;

        return (
          <HoverTooltip
            key={cardId}
            className={`hand-card ${selected ? 'hand-card-selected' : ''}`}
            content={<CardTooltip state={state} cardId={cardId} />}
          >
            {hasCopy && (
              <div
                className="hand-card-replace-badge"
                title="Личность уже на поле — можно заменить"
              >
                ↻ ЗАМЕНА
              </div>
            )}
            <div className="hand-card-name">{def.name}</div>
            <div className="hand-card-stats">
              <span className="stat stat-cost" title="Стоимость">
			    💰{cost}
				{cost !== def.cost && <sup>*</sup>}
              </span>
              <span className="stat stat-str" title="Сила">⚔{def.strength}</span>
              <span className="stat stat-hp" title="Здоровье">❤{def.health}</span>
            </div>
            {def.abilities.length > 0 && (
			  <div className="hand-card-keywords">
			    {def.abilities.map((k) => (
			      <span key={k} className="kw-icon" title={KEYWORD_TEXT[k] ?? k}>
			        {KEYWORD_ICON[k] ?? '•'}
			      </span>
			    ))}
			  </div>
			)}
            {!disabled && (canPlay || canReplace) && (
              <div className="hand-card-actions">
                {canPlay && (
                  <button
                    onClick={() => onPlay(cardId)}
                    title={`Разыграть за ${cost}💰`}
                  >
                    Разыграть
                  </button>
                )}
                {canReplace && (
                  <button
                    onClick={() => onReplace(cardId)}
                    title="Заменить на карту той же личности"
                  >
                    Заменить
                  </button>
                )}
              </div>
            )}
            {!disabled && !canPlay && !canReplace && reason && (
              <div className="hand-card-reason">{reason}</div>
            )}
			{disabled && (
			  <div className="hand-card-reason hand-card-bot-label">💤 Ход соперника</div>
			)}
          </HoverTooltip>
        );
      })}
    </div>
  );
}