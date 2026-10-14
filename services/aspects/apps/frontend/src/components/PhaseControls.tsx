import type { GameState } from '@aspects/engine';

interface Props {
  state: GameState;
  onNext: () => void;
  onEndTurn: () => void;
  disabled?: boolean;
}

const PHASE_ORDER = ['RESTORE', 'MOVE', 'DRAW', 'INFLUENCE', 'PLAY', 'COMBAT', 'END'] as const;

const PHASE_TEXT: Record<string, string> = {
  RESTORE: 'Восстановление',
  MOVE: 'Переход',
  DRAW: 'Добор',
  INFLUENCE: 'Влияние',
  PLAY: 'Разыгрывание',
  COMBAT: 'Бой',
  END: 'Конец',
};

const PHASE_HINT: Record<string, string> = {
  RESTORE: 'Снимается истощение, восстанавливаются карты',
  MOVE: 'Резерв → Фронт у карт, готовых к переходу',
  DRAW: 'Добор карты, бонусы колонок, андердог',
  INFLUENCE: '+1 Влияние и бонусы колонок',
  PLAY: 'Разыгрывайте карты, используйте способности, делайте замены',
  COMBAT: 'Атакуйте картами во Фронте',
  END: 'Сброс до 10, Отчаянье, смена игрока',
};

export function PhaseControls({ state, onNext, onEndTurn, disabled = false }: Props) {
  const phase = state.phase;
  const isDisabled = disabled || state.winner !== null || state.pendingChoice !== null;
  const currentIdx = PHASE_ORDER.indexOf(phase as any);
  const player = state.activePlayer;

  const nextLabel =
    phase === 'RESTORE' ? 'Начать ход'
    : phase === 'PLAY' ? 'В бой!'
    : phase === 'COMBAT' ? 'Завершить ход'
    : 'Дальше';

  const showSkipCombat = phase === 'PLAY';

  return (
    <div className="phase-controls">
      <div className="phase-info">
        <div className="phase-header">
          Ход {state.turnNumber} ·{' '}
          <b className={`phase-active phase-active-${player}`}>
            {player.toUpperCase()}
          </b>
        </div>
        <div className="phase-track">
          {PHASE_ORDER.map((p, i) => (
            <div
              key={p}
              className={
                'phase-step' +
                ` phase-step-${player}` +
                (i === currentIdx ? ' phase-step-current' : '') +
                (i < currentIdx ? ' phase-step-done' : '')
              }
              title={PHASE_TEXT[p]}
            >
              <span className="phase-step-dot" />
              <span className="phase-step-label">{PHASE_TEXT[p]}</span>
            </div>
          ))}
        </div>
        {PHASE_HINT[phase] && (
          <div className="phase-hint">{PHASE_HINT[phase]}</div>
        )}
      </div>

      <div className="phase-buttons">
        <button
          className={`btn-primary btn-primary-${player}`}
          onClick={onNext}
          disabled={isDisabled}
          title="Пробел"
        >
          {nextLabel}
        </button>
        {showSkipCombat && (
          <button
            className="btn-secondary"
            onClick={onEndTurn}
            disabled={isDisabled}
            title="Enter"
          >
            Пропустить бой
          </button>
        )}
      </div>
    </div>
  );
}