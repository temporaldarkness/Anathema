import { useEffect, useState } from 'react';
import type { GameState, CardInstanceId } from '@aspects/engine';

interface Props {
  state: GameState;
  onSubmit: (cardIds: CardInstanceId[]) => void;
}

export function ChoicePrompt({ state, onSubmit }: Props) {
  const choice = state.pendingChoice;
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Сбрасываем выбор при смене pendingChoice (другой игрок, другой эффект).
  useEffect(() => {
    setSelected(new Set());
  }, [choice?.kind, choice?.playerId, choice?.eligibleCardIds.length]);

  if (!choice) return null;

  const isDiscard = choice.kind === 'END_TURN_DISCARD';
  const canCancel = !isDiscard;

  const title = isDiscard
    ? `${choice.playerId.toUpperCase()} должен сбросить ${choice.count} карт(ы)`
    : `${choice.playerId.toUpperCase()} должен выбрать цель (${choice.count})`;

  const subtitle = isDiscard
    ? 'Сброс обязателен — отмена недоступна'
    : 'Отмена — эффект не сработает';

  const toggle = (idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else if (next.size < choice.count) next.add(idx);
      return next;
    });
  };

  const handleSubmit = () => {
    if (selected.size !== choice.count) return;
    const indices = Array.from(selected).sort((a, b) => a - b);
    const cardIds = indices.map((i) => choice.eligibleCardIds[i]);
    onSubmit(cardIds);
    setSelected(new Set());
  };

  const handleCancel = () => {
    if (!canCancel) return;
    onSubmit([]);
    setSelected(new Set());
  };

  return (
    <div className="choice-modal">
      <div className="choice-modal-content">
        <div className="choice-modal-header">
          <h3>{title}</h3>
          {subtitle && <div className="choice-modal-subtitle">{subtitle}</div>}
        </div>
        <div className="choice-list">
          {choice.eligibleCardIds.map((id, idx) => {
            const card = state.cards[id];
            const def = state.definitions[card.definitionId];
            const isSelected = selected.has(idx);
            return (
              <div
                key={id}
                className={`choice-item ${isSelected ? 'choice-item-selected' : ''}`}
                onClick={() => toggle(idx)}
              >
                <span className="choice-item-index">{idx + 1}.</span>
                <span className="choice-item-name">{def?.name ?? card.definitionId}</span>
                {card.ownerId !== choice.playerId && (
                  <span className="choice-item-owner">
                    (у {card.ownerId.toUpperCase()})
                  </span>
                )}
                {isSelected && <span className="choice-item-check">✓</span>}
              </div>
            );
          })}
        </div>
        <div className="choice-actions">
          {canCancel && (
            <button
              className="choice-btn-cancel"
              onClick={handleCancel}
            >
              ✕ Отмена
            </button>
          )}
          <button
            className="choice-btn-submit"
            onClick={handleSubmit}
            disabled={selected.size !== choice.count}
          >
            Подтвердить ({selected.size}/{choice.count})
          </button>
        </div>
      </div>
    </div>
  );
}