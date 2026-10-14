import { useEffect, useState } from 'react';
import { usersApi, type PublicUser } from '../game/usersApi';
import { useOpenProfile } from '../game/profileModal';

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

export function UsersSearchScreen({ onBack, onOpenProfile }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      usersApi
        .search(q, 20)
        .then((list) => {
          if (!cancelled) setResults(list);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  return (
    <div className="page-screen">
      <div className="page-card">
        <div className="page-header">
          <button className="page-header-back" onClick={onBack}>
            ← Профиль
          </button>
          <h1 className="page-header-title">Поиск игроков</h1>
        </div>

        <input
          className="user-search-input"
          placeholder="Введите имя (минимум 2 символа)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          maxLength={32}
        />

        {loading && (
          <div className="page-empty">
            <div className="page-empty-text">Ищем…</div>
          </div>
        )}

        {!loading && query.trim().length >= 2 && results.length === 0 && (
          <div className="page-empty">
            <div className="page-empty-icon">🔍</div>
            <div className="page-empty-text">Никого не нашли</div>
          </div>
        )}

        {!loading && query.trim().length < 2 && (
          <div className="page-empty">
            <div className="page-empty-hint">
              Начните вводить имя — результаты появятся автоматически
            </div>
          </div>
        )}

        {results.length > 0 && (
          <div className="user-search-list">
            {results.map((u) => {
              const initial = u.username[0]?.toUpperCase() ?? '👤';
              const emoji = TIER_EMOJI[u.tier] ?? '🏆';
              return (
                <button
                  key={u.userId}
                  className="user-search-row"
                  onClick={() => onOpenProfile(u.userId)}
                >
                  <div className="user-search-avatar">
                    {u.avatarUrl ? (
                      <img
                        src={u.avatarUrl}
                        alt={u.username}
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : null}
                    <span className="user-search-avatar-fallback">{initial}</span>
                  </div>
                  <div className="user-search-name">
                    {u.username}
                    {u.isAdmin && <span className="user-search-admin">👑</span>}
                  </div>
                  <div className="user-search-rating">
                    <span className="user-search-tier">{emoji}</span>
                    <span className="user-search-rating-value">{u.rating}</span>
                    <span className="user-search-tier-name">{u.tier}</span>
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