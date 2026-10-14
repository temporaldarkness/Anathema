import { useEffect, useState } from 'react';
import type { PlayerId } from '@aspects/engine';

interface Props {
  deadlineAt: number | null;
  owner: PlayerId | null;
  myPlayerId: PlayerId | null;
  names: Partial<Record<PlayerId, string | null>>;
  totalMs: number;
}

export function TurnTimer({ deadlineAt, owner, myPlayerId, names, totalMs }: Props) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!deadlineAt) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [deadlineAt]);

  if (!deadlineAt || !owner) return null;

  const remainingMs = Math.max(0, deadlineAt - now);
  const seconds = Math.ceil(remainingMs / 1000);
  const pct = Math.min(100, (remainingMs / totalMs) * 100);

  const isMine = owner === myPlayerId;
  const ownerName = names[owner] ?? owner.toUpperCase();

  const danger = seconds <= 10;
  const warning = seconds <= 20 && !danger;

  return (
    <div className={`turn-timer ${danger ? 'turn-timer-danger' : ''} ${warning ? 'turn-timer-warning' : ''}`}>
      <div className="turn-timer-label">
        {isMine ? 'Ваш ход' : `Ход: ${ownerName}`}
      </div>
      <div className="turn-timer-bar">
        <div
          className="turn-timer-fill"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="turn-timer-counter">{seconds}с</div>
    </div>
  );
}