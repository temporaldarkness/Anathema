interface Props {
  paused: boolean;
  speed: number;
  onTogglePause: () => void;
  onChangeSpeed: (v: number) => void;
}

export function ObserveControls({ paused, speed, onTogglePause, onChangeSpeed }: Props) {
  return (
    <div className="observe-controls">
      <button
        className="observe-btn"
        onClick={onTogglePause}
        title={paused ? 'Продолжить' : 'Пауза'}
      >
        {paused ? '▶' : '⏸'}
      </button>
      {[1, 2, 4].map((s) => (
        <button
          key={s}
          className={`observe-btn ${speed === s && !paused ? 'observe-btn-active' : ''}`}
          onClick={() => onChangeSpeed(s)}
          title={`Скорость ×${s}`}
        >
          ×{s}
        </button>
      ))}
    </div>
  );
}