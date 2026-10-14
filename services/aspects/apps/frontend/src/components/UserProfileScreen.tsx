import { useEffect, useState } from 'react';
import { usersApi, type PublicUser } from '../game/usersApi';
import { friendsApi, type RelationStatus } from '../game/friendsApi';
import {
  ratingApi,
  type RatingHistoryEntry,
} from '../game/ratingApi';
import { useOpenProfile } from '../game/profileModal';
import { useConfirm } from '../game/confirmContext';

interface Props {
  userId: string;
  onBack: () => void;
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

export function UserProfileScreen({ userId, onBack }: Props) {
  const openProfile = useOpenProfile();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [history, setHistory] = useState<RatingHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [relation, setRelation] = useState<RelationStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  
  const confirm = useConfirm();
  
  useEffect(() => {
    friendsApi
      .status(userId)
      .then(setRelation)
      .catch(() => setRelation(null));
  }, [userId]);
  
  const handleFriendAction = async () => {
    if (!relation || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      if (relation.kind === 'none') {
        await friendsApi.request(userId);
      } else if (relation.kind === 'incoming') {
        await friendsApi.accept(relation.requestId);
      } else if (relation.kind === 'outgoing') {
        await friendsApi.cancel(relation.requestId);
      } else if (relation.kind === 'friends') {
        const ok = await confirm({
          title: 'Удалить из друзей?',
          confirmLabel: 'Удалить',
          danger: true,
        });
        if (!ok) {
			setBusy(false);
            return;
		}
		await friendsApi.remove(userId);
      }
      const next = await friendsApi.status(userId);
      setRelation(next);
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  
  const friendButtonLabel = (): string | null => {
    if (!relation) return null;
    switch (relation.kind) {
      case 'self': return null;
      case 'none': return '+ Добавить в друзья';
      case 'incoming': return '✓ Принять заявку';
      case 'outgoing': return '⏱ Отменить заявку';
      case 'friends': return '★ В друзьях';
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      usersApi.getPublic(userId),
      ratingApi.historyOf(userId, 20).catch(() => [] as RatingHistoryEntry[]),
    ])
      .then(([u, h]) => {
        if (cancelled) return;
        setUser(u);
        setHistory(h);
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

  const initial =
    (user?.username && user.username.trim()[0]?.toUpperCase()) || '👤';
  const emoji = user ? TIER_EMOJI[user.tier] ?? '🏆' : '🏆';
  const total = user?.matchesPlayed ?? 0;
  const wr = total > 0 && user ? Math.round((user.wins / total) * 100) : 0;

  return (
    <div className="page-screen">
      <div className="page-card page-card-narrow">
        <div className="page-header">
          <button className="page-header-back" onClick={onBack}>
            ← Назад
          </button>
          <h1 className="page-header-title">Профиль игрока</h1>
        </div>

        {loading && (
          <div className="page-empty">
            <div className="page-empty-text">Загрузка…</div>
          </div>
        )}

        {error && (
          <div className="page-empty">
            <div className="page-empty-text">Не удалось загрузить: {error}</div>
          </div>
        )}

        {!loading && !error && user && (
          <>
            <div className="profile-header">
              <div className="profile-avatar">
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.username}
                    className="profile-avatar-img"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
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
				  {friendButtonLabel() && (
                    <button
                      type="button"
                      className={`friend-cta friend-cta-${relation?.kind}`}
                      onClick={handleFriendAction}
                      disabled={busy}
                    >
                      {busy ? '…' : friendButtonLabel()}
                    </button>
                  )}
                  {actionError && <span className="friend-cta-error">{actionError}</span>}
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
                  style={{ color: 'var(--clr-text-muted)', fontSize: 18 }}
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

            <div className="profile-history">
              <div className="profile-history-title">
                Последние {history.length} игр · винрейт {wr}%
              </div>
              {history.length === 0 ? (
                <div className="profile-history-empty">
                  История матчей отсутствует
                </div>
              ) : (
                <div className="profile-history-list">
                  {history.map((h) => {
                    const date = new Date(h.playedAt);
                    const dateText = date.toLocaleDateString('ru-RU', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    });
                    const oppClickable =
                      h.opponentId &&
                      !h.opponentId.startsWith('anon:') &&
                      !h.opponentId.startsWith('bot:');
                    return (
                      <div key={h.id} className="profile-history-row">
                        <span
                          className={`profile-history-result profile-history-result-${h.result}`}
                        >
                          {h.result === 'win'
                            ? '🏆'
                            : h.result === 'loss'
                              ? '💀'
                              : '🤝'}
                        </span>
                        <span
                          className={`profile-history-opponent ${oppClickable ? 'profile-history-opponent-clickable' : ''}`}
                          onClick={
                            oppClickable
                              ? (e) => {
                                  e.stopPropagation();
                                  openProfile(h.opponentId);
                                }
                              : undefined
                          }
                        >
                          {h.opponentName}
                        </span>
                        <span className="profile-history-date">{dateText}</span>
                        <span
                          className={`profile-history-delta ${
                            h.delta >= 0
                              ? 'profile-history-delta-pos'
                              : 'profile-history-delta-neg'
                          }`}
                        >
                          {h.delta >= 0 ? `+${h.delta}` : h.delta}
                        </span>
                        <span className="profile-history-rating">
                          {h.ratingAfter}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}