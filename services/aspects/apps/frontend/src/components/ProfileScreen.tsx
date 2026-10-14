import { useMemo, useState } from 'react';
import type { AuthState } from '../game/useAuth';
import type { DeckDto } from '@aspects/shared';
import { AuthBadge } from './AuthBadge';
import { AnonNameModal } from './AnonNameModal';
import { ThemeModal } from './ThemeModal';
import { useTheme } from '../game/useTheme';
import { RatingBadge } from './RatingBadge';
import { useRating } from '../game/useRating';
import { BotsModal } from './BotsModal';
import { useOpenProfile } from '../game/profileModal';
import { useRatingHistory } from '../game/useRatingHistory';
import { UserProfileScreen } from './UserProfileScreen';

interface MatchSummary {
  id: string;
  player1Name: string;
  player2Name: string;
  winnerId: string | null;
  p1BotName: string | null;
  p2BotName: string | null;
}

interface Props {
  auth: AuthState;
  savedDecks: DeckDto[];
  matches: MatchSummary[];
  matchesLoading: boolean;
  onNavigate: (
    target:
      | 'setup'
      | 'online'
      | 'decks'
      | 'history'
      | 'users-search'
      | 'leaderboard'
	  | 'friends',
  ) => void;
}

export function ProfileScreen({
  auth,
  savedDecks,
  matches,
  matchesLoading,
  onNavigate,
}: Props) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [localAnonName, setLocalAnonName] = useState<string | null>(null);
  const [themeModalOpen, setThemeModalOpen] = useState(false);
  const [botsOpen, setBotsOpen] = useState(false);
  const theme = useTheme();
  const rating = useRating({ auth });
  const openProfile = useOpenProfile();
  const history = useRatingHistory({
    enabled: auth.kind === 'authenticated',
    limit: 10,
  });

  const displayName =
    auth.kind === 'authenticated'
      ? auth.user.username
      : auth.kind === 'anonymous'
        ? localAnonName ?? auth.anonName
        : '…';

  const isAnon = auth.kind === 'anonymous';
  const isAuth = auth.kind === 'authenticated';

  const stats = useMemo(() => {
    if (!isAuth) return null;
    const myName = auth.user.username;
    let wins = 0;
    let losses = 0;
    let total = 0;
    for (const m of matches) {
      const isP1 = m.player1Name === myName;
      const isP2 = m.player2Name === myName;
      if (!isP1 && !isP2) continue;
      total++;
      const mySide = isP1 ? 'p1' : 'p2';
      if (m.winnerId === mySide) wins++;
      else if (m.winnerId) losses++;
    }
    const wr = total > 0 ? Math.round((wins / total) * 100) : 0;
    return { wins, losses, total, wr };
  }, [matches, auth, isAuth]);

  const avatarUrl =
    auth.kind === 'authenticated' ? auth.user.avatarUrl ?? null : null;

  const avatarLetter =
    (displayName && displayName.trim()[0]?.toUpperCase()) || '👤';

  return (
    <div className="profile-screen">
      <AnonNameModal
        open={renameOpen}
        onConfirm={(name: string) => {
          setLocalAnonName(name);
          setRenameOpen(false);
        }}
      />

      <ThemeModal
        open={themeModalOpen}
        themes={theme.themes}
        current={theme.theme}
		loading={theme.loading}
        onSelect={(name: string) => theme.setTheme(name)}
        onClose={() => setThemeModalOpen(false)}
      />
	  <BotsModal open={botsOpen} onClose={() => setBotsOpen(false)} />

      <div className="profile-card">
        <div className="profile-header">
          <div className="profile-avatar">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={displayName}
                className="profile-avatar-img"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : null}
            <span className="profile-avatar-fallback">{avatarLetter}</span>
          </div>
          <div className="profile-header-info">
            <div className="profile-name-row">
              <div className="profile-name">{displayName}</div>
              {isAnon && (
                <button
                  className="profile-name-edit"
                  onClick={() => setRenameOpen(true)}
                  title="Изменить имя"
                >
                  ✏
                </button>
              )}
            </div>
            <div className="profile-badges">
              {auth.kind === 'authenticated' ? (
                <button
                  type="button"
                  className="profile-link-btn"
                  onClick={() => openProfile(auth.user.id)}
                  title="Открыть публичный профиль"
                >
                  <AuthBadge auth={auth} />
                </button>
              ) : (
                <AuthBadge auth={auth} />
              )}
              {isAuth && <RatingBadge rating={rating.rating} loading={rating.loading} />}
              {isAnon && (
                <span className="profile-role-badge profile-role-anon">🅰 Аноним</span>
              )}
              {isAuth && (
                <span className="profile-role-badge profile-role-auth">👤 Webway</span>
              )}
            </div>
          </div>
        </div>

        <div className="profile-stats">
          {!isAuth ? (
            <div className="profile-stats-empty">
              Войдите через Webway, чтобы видеть рейтинг.
            </div>
          ) : rating.loading || !rating.rating ? (
            <div className="profile-stats-empty">Загрузка…</div>
          ) : (
            <>
              <div className="profile-stat">
                <div className="profile-stat-value">
                  {rating.rating.rating}
                </div>
                <div className="profile-stat-label">Рейтинг</div>
              </div>
              <div className="profile-stat">
                <div className="profile-stat-value" style={{ color: '#8a8f99', fontSize: 18 }}>
                  ±{rating.rating.rd}
                </div>
                <div className="profile-stat-label">Точность (RD)</div>
              </div>
              <div className="profile-stat">
                <div className="profile-stat-value profile-stat-win">
                  {rating.rating.wins}
                </div>
                <div className="profile-stat-label">Побед</div>
              </div>
              <div className="profile-stat">
                <div className="profile-stat-value profile-stat-loss">
                  {rating.rating.losses}
                </div>
                <div className="profile-stat-label">Поражений</div>
              </div>
            </>
          )}
        </div>
		{isAuth && (
          <div className="profile-history">
            <div className="profile-history-title">Последние игры</div>
            {history.loading ? (
              <div className="profile-history-empty">Загрузка…</div>
            ) : history.history.length === 0 ? (
              <div className="profile-history-empty">
                Сыграйте рейтинговый матч — здесь появится история
              </div>
            ) : (
              <div className="profile-history-list">
                {history.history.map((h) => {
                  const clickable =
                    h.opponentId &&
                    !h.opponentId.startsWith('anon:') &&
                    !h.opponentId.startsWith('bot:');
                  const date = new Date(h.playedAt);
                  const dateText = date.toLocaleDateString('ru-RU', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  return (
                    <div key={h.id} className="profile-history-row">
                      <span
                        className={`profile-history-result profile-history-result-${h.result}`}
                        title={h.result === 'win' ? 'Победа' : h.result === 'loss' ? 'Поражение' : 'Ничья'}
                      >
                        {h.result === 'win' ? '🏆' : h.result === 'loss' ? '💀' : '🤝'}
                      </span>
                      <span
                        className={`profile-history-opponent ${clickable ? 'profile-history-opponent-clickable' : ''}`}
                        onClick={
                          clickable
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
                          h.delta >= 0 ? 'profile-history-delta-pos' : 'profile-history-delta-neg'
                        }`}
                      >
                        {h.delta >= 0 ? `+${h.delta}` : h.delta}
                      </span>
                      <span className="profile-history-rating">{h.ratingAfter}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="profile-actions">
          <button
            className="profile-action profile-action-primary"
            onClick={() => onNavigate('setup')}
          >
            <div className="profile-action-icon">🎮</div>
            <div className="profile-action-title">Новая игра</div>
            <div className="profile-action-desc">
              Хотсит или против бота
            </div>
          </button>

          <button
            className="profile-action"
            onClick={() => onNavigate('online')}
          >
            <div className="profile-action-icon">🌐</div>
            <div className="profile-action-title">Онлайн</div>
            <div className="profile-action-desc">
              Создать комнату или присоединиться
            </div>
          </button>

          <button
            className="profile-action"
            onClick={() => onNavigate('decks')}
          >
            <div className="profile-action-icon">📚</div>
            <div className="profile-action-title">Колоды</div>
            <div className="profile-action-desc">
              {savedDecks.length > 0
                ? `${savedDecks.length} сохранённых`
                : 'Соберите первую колоду'}
            </div>
          </button>

          <button
            className="profile-action"
            onClick={() => onNavigate('history')}
            disabled={!isAuth}
          >
            <div className="profile-action-icon">📜</div>
            <div className="profile-action-title">История</div>
            <div className="profile-action-desc">
              {isAuth ? 'Реплеи и результаты' : 'Только для аккаунтов'}
            </div>
          </button>
			
		  <button
            className="profile-action"
            onClick={() => setBotsOpen(true)}
          >
            <div className="profile-action-icon">🤖</div>
            <div className="profile-action-title">Боты</div>
            <div className="profile-action-desc">
              Рейтинговая таблица ИИ
            </div>
          </button>
		  <button
            className="profile-action"
            onClick={() => onNavigate('users-search')}
          >
            <div className="profile-action-icon">🔍</div>
            <div className="profile-action-title">Игроки</div>
            <div className="profile-action-desc">Поиск по имени</div>
          </button>
          
          <button
            className="profile-action"
            onClick={() => onNavigate('leaderboard')}
          >
            <div className="profile-action-icon">🏆</div>
            <div className="profile-action-title">Лидерборд</div>
            <div className="profile-action-desc">Топ-100 по рейтингу</div>
          </button>
		  <button
            className="profile-action"
            onClick={() => onNavigate('friends')}
          >
            <div className="profile-action-icon">👥</div>
            <div className="profile-action-title">Друзья</div>
            <div className="profile-action-desc">
              {isAuth ? 'Список друзей и заявок' : 'Только для аккаунтов'}
            </div>
          </button>
          <button
            className="profile-action"
            onClick={() => setThemeModalOpen(true)}
          >
            <div className="profile-action-icon">🎨</div>
            <div className="profile-action-title">Темы</div>
            <div className="profile-action-desc">
              Оформление интерфейса
            </div>
          </button>
        </div>

        <div className="profile-coming-soon">
          <div className="profile-coming-soon-title">Скоро</div>
          <div className="profile-coming-soon-grid">
            <div className="profile-coming-soon-item">
              <span className="profile-coming-soon-icon">🎒</span>
              Коллекция
            </div>
            <div className="profile-coming-soon-item">
              <span className="profile-coming-soon-icon">🎁</span>
              Бустеры
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}