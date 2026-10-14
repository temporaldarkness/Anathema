import { useState } from 'react';
import type { GameState, CardInstanceId } from '@aspects/engine';

interface Props {
  state: GameState;
  onConfirm: (cardId: CardInstanceId | null) => void;
  currentPicker: 'p1' | 'p2';
}

export function MulliganScreen({ state, onConfirm, currentPicker }: Props) {
  const [selected, setSelected] = useState<CardInstanceId | null>(null);
  const hand = state.players[currentPicker].hand;
  const done = state.mulliganDone[currentPicker];
  const otherDone = state.mulliganDone[currentPicker === 'p1' ? 'p2' : 'p1'];

  if (done) {
    return (
      <div className="mulligan-overlay">
        <div className="mulligan-modal">
          <div className="mulligan-title">
            {currentPicker.toUpperCase()} — готов
          </div>
          <div className="mulligan-subtitle">
            {otherDone ? 'Начинаем партию…' : 'Ожидание второго игрока…'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mulligan-overlay">
      <div className="mulligan-modal">
        <div className="mulligan-title">Mulligan — {currentPicker.toUpperCase()}</div>
        <div className="mulligan-subtitle">
          Кликните карту, чтобы заменить её. Она вернётся в колоду, придёт случайная.
        </div>

        <div className="mulligan-hand">
          {hand.map((id) => {
            const card = state.cards[id];
            const def = state.definitions[card.definitionId];
            const isSelected = selected === id;
            return (
              <div
                key={id}
                className={`mulligan-card ${isSelected ? 'mulligan-card-selected' : ''}`}
                onClick={() => setSelected(isSelected ? null : id)}
              >
                {isSelected && <div className="mulligan-card-mark">↻</div>}
                <div className="mulligan-card-name">{def.name}</div>
                <div className="mulligan-card-cost">💰 {def.cost}</div>
              </div>
            );
          })}
        </div>

        <div className="mulligan-actions">
          <button
            className="mulligan-btn"
            disabled={!!selected}
            onClick={() => {
              setSelected(null);
              onConfirm(null);
            }}
          >
            Оставить руку
          </button>
          <button
            className="mulligan-btn mulligan-btn-primary"
            disabled={!selected}
            onClick={() => {
              if (!selected) return;
              const id = selected;
              setSelected(null);
              onConfirm(id);
            }}
          >
            Заменить выбранную
          </button>
        </div>
      </div>
    </div>
  );
}