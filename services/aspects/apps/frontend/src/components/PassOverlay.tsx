interface Props {
  nextPlayer: 'p1' | 'p2';
  onConfirm: () => void;
}

export function PassOverlay({ nextPlayer, onConfirm }: Props) {
  return (
    <div className="pass-overlay">
      <div className="pass-modal">
        <div className="pass-emoji">🎴</div>
        <div className="pass-title">
          Ход игрока <b>{nextPlayer.toUpperCase()}</b>
        </div>
        <div className="pass-subtitle">
          Передайте устройство. Игрок{' '}
          <b>{nextPlayer === 'p1' ? 'P2' : 'P1'}</b>, отвернись от экрана.
        </div>
        <button className="pass-btn" onClick={onConfirm}>
          Я — {nextPlayer.toUpperCase()}, готов
        </button>
      </div>
    </div>
  );
}