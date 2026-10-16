import { useEffect, useState } from 'react';
import type { GameState, CardInstanceId } from '@aspects/engine';

interface Props {
  state: GameState;
  onSubmit: (cardIds: CardInstanceId[]) => void;
  /**
   * Отмена. Что именно отправить (RESOLVE_CHOICE([]) или CANCEL_CHOICE)
   * решает вызывающий компонент в зависимости от kind.
   */
  onCancel: () => void;
}

export function ChoicePrompt({ state, onSubmit, onCancel }: Props) {
  const choice = state.pendingChoice;
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Сбрасываем выбор при смене pendingChoice.
  useEffect(() => {
    setSelected(new Set());
  }, [choice?.kind, choice?.playerId, choice?.eligibleCardIds.length]);

  if (!choice) return null;

  const isDiscard = choice.kind === 'END_TURN_DISCARD';
  const isReplace = choice.kind === 'REPLACE_TARGET_SELECTION';
  const count = isReplace ? 1 : choice.count;
  const canCancel = !isDiscard;

  const title = isDiscard
    ? `${choice.playerId.toUpperCase()} должен сбросить ${count} карт(ы)`
    : isReplace
      ? `${choice.playerId.toUpperCase()} — какую карту заменить?`
      : `${choice.playerId.toUpperCase()} должен выбрать цель (${count})`;

  const subtitle = isDiscard
    ? 'Сброс обязателен — отмена недоступна'
    : isReplace
      ? 'Выберите карту для замены. Отмена — замена не сработает.'
      : 'Отмена — эффект не сработает';

  const toggle = (idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else if (next.size < count) next.add(idx);
      return next;
    });
  };

  const handleSubmit = () => {
    if (selected.size !== count) return;
    const indices = Array.from(selected).sort((a, b) => a - b);
    const cardIds = indices.map((i) => choice.eligibleCardIds[i]);
    onSubmit(cardIds);
    setSelected(new Set());
  };

  const handleCancel = () => {
    if (!canCancel) return;
    onCancel();
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
            <button className="choice-btn-cancel" onClick={handleCancel}>
              ✕ Отмена
            </button>
          )}
          <button
            className="choice-btn-submit"
            onClick={handleSubmit}
            disabled={selected.size !== count}
          >
            Подтвердить ({selected.size}/{count})
          </button>
        </div>
      </div>
    </div>
  );
}