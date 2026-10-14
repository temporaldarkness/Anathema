import { useEffect, useState } from 'react';
import { usersApi, type PublicUser } from '../game/usersApi';

interface Props {
  userId: string | null;
  onClose: () => void;
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

export function PublicProfileModal({ userId, onClose }: Props) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setUser(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    usersApi
      .getPublic(userId)
      .then((u) => {
        if (!cancelled) setUser(u);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [userId, onClose]);

  if (!userId) return null;

  const initial =
    (user?.username && user.username.trim()[0]?.toUpperCase()) || '👤';
  const emoji = user ? TIER_EMOJI[user.tier] ?? '🏆' : '🏆';
  const total = user?.matchesPlayed ?? 0;
  const wr = total > 0 && user ? Math.round((user.wins / total) * 100) : 0;

  return (
    <div className="public-profile-overlay" onClick={onClose}>
      <div className="public-profile-card" onClick={(e) => e.stopPropagation()}>
        <button
          className="theme-modal-close public-profile-close"
          onClick={onClose}
          aria-label="Закрыть"
        >
          ✕
        </button>

        {loading && (
          <div className="public-profile-loading">Загрузка профиля…</div>
        )}

        {error && (
          <div className="public-profile-loading public-profile-error">
            Не удалось загрузить: {error}
          </div>
        )}

        {!loading && !error && user && (
          <>
            <div className="public-profile-header">
              <div className="profile-avatar public-profile-avatar">
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.username}
                    className="profile-avatar-img"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display =
                        'none';
                    }}
                  />
                ) : null}
                <span className="profile-avatar-fallback">{initial}</span>
              </div>
              <div className="profile-header-info">
                <div className="profile-name-row">
                  <div className="profile-name">{user.username}</div>
                </div>
                <div className="profile-badges">
                  <span className="rating-badge">
                    <span className="rating-badge-icon">{emoji}</span>
                    <span className="rating-badge-value">{user.rating}</span>
                    <span className="rating-badge-tier">{user.tier}</span>
                  </span>
                  {user.isAdmin && (
                    <span className="profile-role-badge profile-role-auth">
                      👑 Администратор
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="profile-stats">
              <div className="profile-stat">
                <div className="profile-stat-value">{user.rating}</div>
                <div className="profile-stat-label">Рейтинг</div>
              </div>
              <div className="profile-stat">
                <div
                  className="profile-stat-value"
                  style={{ color: '#8a8f99', fontSize: 18 }}
                >
                  ±{user.rd}
                </div>
                <div className="profile-stat-label">Точность (RD)</div>
              </div>
              <div className="profile-stat">
                <div className="profile-stat-value profile-stat-win">
                  {user.wins}
                </div>
                <div className="profile-stat-label">Побед</div>
              </div>
              <div className="profile-stat">
                <div className="profile-stat-value profile-stat-loss">
                  {user.losses}
                </div>
                <div className="profile-stat-label">Поражений</div>
              </div>
            </div>

            <div className="public-profile-summary">
              {total === 0 ? (
                <div className="public-profile-summary-empty">
                  Сыграно матчей: 0
                </div>
              ) : (
                <div className="public-profile-summary-line">
                  Сыграно матчей: <b>{total}</b> · Винрейт: <b>{wr}%</b>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}