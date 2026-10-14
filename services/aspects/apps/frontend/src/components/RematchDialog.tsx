import { useEffect, useState } from 'react';

interface Props {
  /** Имя того, кто предложил реванш. */
  fromName: string;
  onAccept: () => void;
  onDecline: () => void;
  /** Общий TTL предложения в мс — для визуального отсчёта. */
  ttlMs?: number;
}

export function RematchDialog({
  fromName,
  onAccept,
  onDecline,
  ttlMs = 30_000,
}: Props) {
  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(ttlMs / 1000));

  useEffect(() => {
    const startedAt = Date.now();
    const id = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const left = Math.max(0, Math.ceil((ttlMs - elapsed) / 1000));
      setSecondsLeft(left);
    }, 500);
    return () => clearInterval(id);
  }, [ttlMs]);

  return (
    <div className="rematch-overlay">
      <div className="rematch-modal">
        <div className="rematch-emoji">🔄</div>
        <div className="rematch-title">Соперник предлагает реванш</div>
        <div className="rematch-subtitle">
          <b>{fromName}</b> хочет сыграть ещё раз. Принять?
        </div>
        <div className="rematch-timer">
          ⏱ Осталось {secondsLeft}с
        </div>
        <div className="rematch-actions">
          <button className="rematch-btn rematch-btn-decline" onClick={onDecline}>
            Отказаться
          </button>
          <button className="rematch-btn rematch-btn-accept" onClick={onAccept}>
            Принять
          </button>
        </div>
      </div>
    </div>
  );
}