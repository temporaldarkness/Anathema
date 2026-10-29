import type { GameState, PlayerId } from '@aspects/engine';

interface Props {
  state: GameState;
  onNewGame: () => void;
  onExit: () => void;
  /** Если задан — показываем «Вы победили / проиграли». */
  myPlayerId?: PlayerId | null;
  /** Имена игроков для отображения. */
  playerNames?: Partial<Record<PlayerId, string | null>>;
  /** Заголовок кнопки «Реванш». */
  newGameLabel?: string;
  /** Если true — кнопка «Реванш» заблокирована. */
  newGameDisabled?: boolean;
  /** Заголовок заблокированной кнопки. */
  newGameDisabledLabel?: string;
  /** Заголовок кнопки выхода. По умолчанию — «Назад». */
  exitLabel?: string;
  /** Дополнительная подпись под кнопками (для «Ожидание ответа соперника…»). */
  extraHint?: string | null;
  
  opponentIsBot?: boolean;
  
  ratingUpdate?: {
    side: 'winner' | 'loser';
    delta: string;
    after: number;
    tier: string;
  } | null;
}

function reasonText(reason: string | null): string {
  if (reason === 'glory_zero') return 'Величие противника достигло нуля';
  if (reason === 'alt_victory') return 'Захвачены все нейтральные клетки';
  if (reason === 'concede') return 'Соперник сдался';
  return reason ?? '';
}

export function VictoryModal({
  state,
  onNewGame,
  onExit,
  myPlayerId,
  playerNames,
  newGameLabel = 'Реванш',
  newGameDisabled = false,
  newGameDisabledLabel = 'Ожидание соперника…',
  exitLabel = 'Назад',
  extraHint = null,
  ratingUpdate = null,
  opponentIsBot = false,
}: Props) {
  if (!state.winner) return null;

  const winner = state.winner;
  const loser: PlayerId = winner === 'p1' ? 'p2' : 'p1';
  const winnerName = playerNames?.[winner] ?? winner.toUpperCase();
  const loserName = playerNames?.[loser] ?? loser.toUpperCase();

  const personalMode = myPlayerId != null;
  const iWon = personalMode && myPlayerId === winner;

  const reason = reasonText(state.winnerReason).toLowerCase();
  let title = `Победа: ${winnerName}`;
  let subtitle = reasonText(state.winnerReason);

  if (personalMode) {
    if (iWon) {
      title = 'Вы победили';
      subtitle = `${loserName}: ${reasonText(state.winnerReason).toLowerCase()}`;
    } else {
      title = 'Вы проиграли';
      subtitle = `${winnerName} победил · ${reasonText(state.winnerReason).toLowerCase()}`;
    }
  }

  return (
    <div className="victory-overlay">
      <div className="victory-modal">
        <div className="victory-emoji">{personalMode && !iWon ? '💀' : '🏆'}</div>
        <div className="victory-title">{title}</div>
        {subtitle && <div className="victory-reason">{subtitle}</div>}
		{ratingUpdate && (
          <div className="victory-rating">
            <div className="victory-rating-label">Рейтинг</div>
            <div className="victory-rating-row">
              <span
                className={`victory-rating-delta victory-rating-delta-${ratingUpdate.delta.startsWith('+') ? 'up' : 'down'}`}
              >
                {ratingUpdate.delta}
              </span>
              <span className="victory-rating-arrow">→</span>
              <span className="victory-rating-after">{ratingUpdate.after}</span>
              <span className="victory-rating-tier">{ratingUpdate.tier}</span>
            </div>
          </div>
        )}
        <div className="victory-actions">
          <button
            className="victory-btn"
            onClick={onNewGame}
            disabled={newGameDisabled}
          >
            {newGameDisabled ? newGameDisabledLabel : newGameLabel}
          </button>
          <button className="victory-btn victory-btn-secondary" onClick={onExit}>
            {exitLabel}
          </button>
        </div>
        {extraHint && <div className="victory-extra-hint">{extraHint}</div>}
      </div>
    </div>
  );
}