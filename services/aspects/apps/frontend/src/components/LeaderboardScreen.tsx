import { useEffect, useState } from 'react';
import { usersApi, type LeaderboardEntry } from '../game/usersApi';

interface Props {
  onBack: () => void;
  onOpenProfile: (userId: string) => void;
}

const TIER_EMOJI: Record<string, string> = {
  'Новичок': '🥉',
  'Ученик': '🥈',
  'Любитель': '🥇',
  'Опытный': '⭐',
  'Ветеран': '🌟',
  'Мастер': '👑',
  'Гроссмейстер': '💎',
};

function rankBadge(rank: number): string {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `#${rank}`;
}

export function LeaderboardScreen({ onBack, onOpenProfile }: Props) {
  const [rows, setRows] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    usersApi
      .leaderboard(100)
      .then((list) => {
        if (!cancelled) setRows(list);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="page-screen">
      <div className="page-card">
        <div className="page-header">
          <button className="page-header-back" onClick={onBack}>
            ← Профиль
          </button>
          <h1 className="page-header-title">Лидерборд</h1>
        </div>

        {loading && (
          <div className="page-empty">
            <div className="page-empty-text">Загрузка…</div>
          </div>
        )}

        {!loading && rows.length === 0 && (
          <div className="page-empty">
            <div className="page-empty-icon">📊</div>
            <div className="page-empty-text">
              Рейтинговых игр пока не было
            </div>
            <div className="page-empty-hint">
              Сыграйте матч через «Быструю игру», чтобы попасть в таблицу
            </div>
          </div>
        )}

        {rows.length > 0 && (
          <div className="lb-table">
            <div className="lb-head">
              <div>#</div>
              <div>Игрок</div>
              <div>Рейтинг</div>
              <div>Матчей</div>
              <div>W / L</div>
            </div>
            {rows.map((r) => {
              const initial = r.username[0]?.toUpperCase() ?? '👤';
              const emoji = TIER_EMOJI[r.tier] ?? '🏆';
              return (
                <button
                  key={r.userId}
                  className={`lb-row ${r.rank <= 3 ? `lb-row-top lb-row-top-${r.rank}` : ''}`}
                  onClick={() => onOpenProfile(r.userId)}
                >
                  <div className="lb-rank">{rankBadge(r.rank)}</div>
                  <div className="lb-player">
                    <span className="lb-avatar">
                      {r.avatarUrl ? (
                        <img
                          src={r.avatarUrl}
                          alt={r.username}
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : null}
                      <span className="lb-avatar-fallback">{initial}</span>
                    </span>
                    <span className="lb-name">{r.username}</span>
                    {r.isAdmin && <span className="user-search-admin">👑</span>}
                  </div>
                  <div className="lb-rating">
                    <span className="lb-tier">{emoji}</span>
                    <span className="lb-value">{r.rating}</span>
                  </div>
                  <div className="lb-matches">{r.matchesPlayed}</div>
                  <div className="lb-wl">
                    <span className="lb-w">{r.wins}</span>
                    <span className="lb-sep">/</span>
                    <span className="lb-l">{r.losses}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}