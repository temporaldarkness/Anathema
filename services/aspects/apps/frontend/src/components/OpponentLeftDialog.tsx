interface Props {
  name: string;
  onWait: () => void;
  onExit: () => void;
}

export function OpponentLeftDialog({ name, onWait, onExit }: Props) {
  return (
    <div className="opponent-left-overlay">
      <div className="opponent-left-modal">
        <div className="opponent-left-emoji">🚪</div>
        <div className="opponent-left-title">Соперник вышел</div>
        <div className="opponent-left-subtitle">
          <b>{name}</b> покинул партию. Можно подождать — если он вернётся,
          игра продолжится с того же места.
        </div>
        <div className="opponent-left-actions">
          <button className="opponent-left-btn" onClick={onExit}>
            Выйти в лобби
          </button>
          <button className="opponent-left-btn opponent-left-btn-primary" onClick={onWait}>
            Ждать соперника
          </button>
        </div>
      </div>
    </div>
  );
}