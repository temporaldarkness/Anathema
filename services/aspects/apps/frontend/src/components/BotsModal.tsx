import { useEffect, useMemo, useState } from 'react';
import { ratingApi, type BotRatingEntry } from '../game/ratingApi';

interface Props {
  open: boolean;
  onClose: () => void;
}

const STYLE_LABELS: Record<string, string> = {
  balanced: 'Сбалансированный',
  aggro: 'Агрессивный',
  defensive: 'Защитный',
  control: 'Контрольный',
  opportunist: 'Оппортунист',
  berserker: 'Берсерк',
};

const LEVEL_LABELS: Record<string, string> = {
  rookie: 'Новичок',
  novice: 'Ученик',
  regular: 'Обычный',
  veteran: 'Ветеран',
  master: 'Мастер',
  grandmaster: 'Гроссмейстер',
};

function parseBotId(id: string): { style: string; level: string } | null {
  const m = id.match(/^heuristic-v\d+-([a-z]+)-([a-z]+)$/);
  if (!m) return null;
  return { style: m[1], level: m[2] };
}

export function BotsModal({ open, onClose }: Props) {
  const [bots, setBots] = useState<BotRatingEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    ratingApi
      .allBots()
      .then((list) => setBots(list))
      .catch(() => setBots([]))
      .finally(() => setLoading(false));
  }, [open]);

  const rows = useMemo(() => {
    return bots.map((b) => {
      const parsed = parseBotId(b.botId);
      return {
        ...b,
        styleLabel: parsed ? STYLE_LABELS[parsed.style] ?? parsed.style : '—',
        levelLabel: parsed ? LEVEL_LABELS[parsed.level] ?? parsed.level : '—',
      };
    });
  }, [bots]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="theme-modal-overlay" onClick={onClose}>
      <div
        className="theme-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 720 }}
      >
        <div className="theme-modal-header">
          <h2 className="theme-modal-title">Рейтинг ботов</h2>
          <button
            className="theme-modal-close"
            onClick={onClose}
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>
        <div className="bot-ratings-body">
          {loading && (
            <div className="theme-modal-loading">Загрузка…</div>
          )}
          {!loading && rows.length === 0 && (
            <div className="theme-modal-loading">
              Рейтинги ещё не рассчитаны. Запустите турнир.
            </div>
          )}
          {!loading && rows.length > 0 && (
            <table className="bot-ratings-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Стиль</th>
                  <th>Уровень</th>
                  <th>Рейтинг</th>
                  <th>RD</th>
                  <th>W/L</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.botId}>
                    <td className="bot-rank">{i + 1}</td>
                    <td>{r.styleLabel}</td>
                    <td>{r.levelLabel}</td>
                    <td className="bot-rating">{r.rating}</td>
                    <td className="bot-rd">±{r.rd}</td>
                    <td className="bot-wl">
                      {r.wins}/{r.losses}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}