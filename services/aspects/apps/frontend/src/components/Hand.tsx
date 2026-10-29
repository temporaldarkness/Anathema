import type { GameState, CardInstanceId } from '@aspects/engine';
import { personalityOnBoard, columnBonuses } from '@aspects/engine';
import { HoverTooltip } from './HoverTooltip';
import { CardTooltip } from './CardTooltip';
import { KEYWORD_ICON, resolveKeywordText } from '../game/abilityText';

interface Props {
  state: GameState;
  playerId: 'p1' | 'p2';
  onPlay: (cardId: CardInstanceId) => void;
  onReplace: (cardId: CardInstanceId) => void;
  selectedCardId: CardInstanceId | null;
  disabled?: boolean;
  observe?: boolean;
}

function findReplaceCandidatesFor(
  state: GameState,
  playerId: 'p1' | 'p2',
  newDef: { personalityTag: string; cost: number },
): Array<{ cardId: string; cost: number }> {
  const colReduction = columnBonuses(state, playerId).costReduction;
  const out: Array<{ cardId: string; cost: number }> = [];
  for (const col of state.board) {
    const ids = playerId === 'p1'
      ? [col.p1Front, col.p1Reserve]
      : [col.p2Front, col.p2Reserve];
    for (const cid of ids) {
      if (!cid) continue;
      const c = state.cards[cid];
      if (!c) continue;
      const cd = state.definitions[c.definitionId];
      if (!cd) continue;
      if (cd.personalityTag !== newDef.personalityTag) continue;
      if (cd.cantBeReplaced) continue;
      const discount = Math.min(
        Math.floor(cd.cost / 2),
        Math.floor(newDef.cost / 2),
      );
      const cost = Math.max(0, newDef.cost - discount - colReduction);
      out.push({ cardId: cid, cost });
    }
  }
  return out;
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

        const playCost = Math.max(0, def.cost - bonuses.costReduction);
        const hasCopy = personalityOnBoard(state, playerId, def.personalityTag);
        const canAffordPlay = influence >= playCost;
        
        // Считаем минимальную стоимость замены для этой карты
        let minReplaceCost: number | null = null;
        if (hasCopy) {
          const candidates = findReplaceCandidatesFor(state, playerId, def);
          if (candidates.length > 0) {
            minReplaceCost = Math.min(...candidates.map((c) => c.cost));
          }
        }
        const canAffordReplace = minReplaceCost !== null && influence >= minReplaceCost;
        
        const canPlay = canPlayPhase && canAffordPlay && !hasCopy;
        const canReplace = canPlayPhase && hasCopy && canAffordReplace;
		let reason = '';
        if (!canPlayPhase) {
          reason = 'Только в фазу разыгрывания';
        } else if (!canPlay && !canReplace) {
          const neededCost = hasCopy && minReplaceCost !== null ? minReplaceCost : playCost;
          reason = `Нужно ${neededCost}💧, есть ${influence}`;
        }

        const selected = cardId === selectedCardId;
        const hasActivated = (def.activatedAbilities?.length ?? 0) > 0;

        return (
          <HoverTooltip
            key={cardId}
            className={`hand-card ${selected ? 'hand-card-selected' : ''}`}
            content={<CardTooltip state={state} cardId={cardId} />}
          >
            {hasCopy && (() => {
              // Минимальная стоимость замены (лучший кандидат).
              const candidates = findReplaceCandidatesFor(state, playerId, def);
              const minCost = candidates.length > 0
                ? Math.min(...candidates.map((c) => c.cost))
                : null;
              return (
                <div
                  className="hand-card-replace-badge"
                  title={
                    minReplaceCost !== null
                      ? `Можно заменить, от ${minReplaceCost}💰`
                      : 'Личность уже на поле'
                  }
                >
                  ↻ {minReplaceCost !== null ? `от ${minReplaceCost}💰` : 'ЗАМЕНА'}
                </div>
              );
            })()}
            <div className="hand-card-name">{def.name}</div>
            <div className="hand-card-stats">
              <span className="stat stat-cost" title="Стоимость">
			    💰{playCost}
				{playCost !== def.cost && <sup>*</sup>}
              </span>
              <span className="stat stat-str" title="Сила">⚔{def.strength}</span>
              <span className="stat stat-hp" title="Здоровье">❤{def.health}</span>
            </div>
            {def.abilities.length > 0 && (
			  <div className="hand-card-keywords">
			    {def.abilities.map((k) => (
			      <span key={k} className="kw-icon" title={resolveKeywordText(def, k)}>
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
                    title={`Разыграть за ${playCost}💰`}
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