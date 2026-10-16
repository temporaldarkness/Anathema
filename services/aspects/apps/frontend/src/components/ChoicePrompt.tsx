import { useEffect, useState } from 'react';
import type { GameState, CardInstanceId } from '@aspects/engine';

interface Props {
  state: GameState;
  onSubmit: (cardIds: CardInstanceId[]) => void;
  onCancel: () => void;
}

export function ChoicePrompt({ state, onSubmit, onCancel }: Props) {
  const choice = state.pendingChoice;
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    setSelected(new Set());
  }, [choice?.kind, choice?.playerId, choice?.eligibleCardIds.length]);

  if (!choice) return null;

  const isDiscard = choice.kind === 'END_TURN_DISCARD';
  const isReplace = choice.kind === 'REPLACE_TARGET_SELECTION';
  const isDiscardChosen = choice.kind === 'DISCARD_CHOSEN';
  const isActivationDiscard = choice.kind === 'ACTIVATION_DISCARD';
  const count = isReplace ? 1 : choice.count;
  const canCancel = !isDiscard && !isDiscardChosen;

  let title: string;
  if (isDiscard) {
    title = `${choice.playerId.toUpperCase()} должен сбросить ${count} карт(ы)`;
  } else if (isDiscardChosen) {
    const targetLabel =
      choice.targetPlayerId === choice.playerId
        ? 'из своей руки'
        : `из руки ${choice.targetPlayerId.toUpperCase()}`;
    title = `Выберите ${count} карт(ы) ${targetLabel} для сброса`;
  } else if (isReplace) {
    title = `${choice.playerId.toUpperCase()} — какую карту заменить?`;
  } else if (isActivationDiscard) {
    title = `Сбросьте ${count} карт(ы) для активации способности`;
  } else {
    title = `${choice.playerId.toUpperCase()} должен выбрать цель (${count})`;
  }

  let subtitle: string | null = null;
  if (isDiscard) subtitle = 'Сброс обязателен — отмена недоступна';
  else if (isDiscardChosen) subtitle = 'Сброс обязателен — отмена недоступна';
  else if (isReplace) subtitle = 'Выберите карту для замены. Отмена — замена не сработает.';
  else if (isActivationDiscard) subtitle = 'Отмена — способность не сработает, ничего не потрачено.';
  else subtitle = 'Отмена — эффект не сработает';

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