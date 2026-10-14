import { useEffect, useState } from 'react';
import type { AuthState } from '../game/useAuth';
import { useOpenProfile } from '../game/profileModal';
import { useConfirm } from '../game/confirmContext';
import { useFriends } from '../game/useFriends';
import type { FriendDto, FriendRequestDto } from '../game/friendsApi';

interface Props {
  auth: AuthState;
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

export function FriendsScreen({ auth, onBack }: Props) {
  const openProfile = useOpenProfile();
  const f = useFriends(auth);
  const [tab, setTab] = useState<'friends' | 'incoming' | 'outgoing'>(
    'friends',
  );

  useEffect(() => {
    if (
      !f.loading &&
      f.friends.length === 0 &&
      f.incoming.length > 0 &&
      tab === 'friends'
    ) {
      setTab('incoming');
    }
  }, [f.loading, f.friends.length, f.incoming.length, tab]);

  if (auth.kind !== 'authenticated') {
    return (
      <div className="page-screen">
        <div className="page-card page-card-narrow">
          <div className="page-header">
            <button className="page-header-back" onClick={onBack}>
              ← Профиль
            </button>
            <h1 className="page-header-title">Друзья</h1>
          </div>
          <div className="page-empty">
            <div className="page-empty-icon">🔒</div>
            <div className="page-empty-text">
              Друзья доступны только аккаунтам Webway
            </div>
          </div>
        </div>
      </div>
    );
  }

  const incomingCount = f.incoming.length;

  return (
    <div className="page-screen">
      <div className="page-card">
        <div className="page-header">
          <button className="page-header-back" onClick={onBack}>
            ← Профиль
          </button>
          <h1 className="page-header-title">Друзья</h1>
        </div>

        <div className="friends-tabs">
          <button
            className={`friends-tab ${tab === 'friends' ? 'friends-tab-active' : ''}`}
            onClick={() => setTab('friends')}
          >
            Друзья
            {f.friends.length > 0 && (
              <span className="friends-tab-count">{f.friends.length}</span>
            )}
          </button>
          <button
            className={`friends-tab ${tab === 'incoming' ? 'friends-tab-active' : ''}`}
            onClick={() => setTab('incoming')}
          >
            Заявки
            {incomingCount > 0 && (
              <span className="friends-tab-badge">{incomingCount}</span>
            )}
          </button>
          <button
            className={`friends-tab ${tab === 'outgoing' ? 'friends-tab-active' : ''}`}
            onClick={() => setTab('outgoing')}
          >
            Отправленные
            {f.outgoing.length > 0 && (
              <span className="friends-tab-count">{f.outgoing.length}</span>
            )}
          </button>
        </div>

        {f.loading && (
          <div className="page-empty">
            <div className="page-empty-text">Загрузка…</div>
          </div>
        )}

        {!f.loading && tab === 'friends' && (
          <FriendsList
            items={f.friends}
            onOpenProfile={openProfile}
            onRemove={f.remove}
            emptyText="У вас пока нет друзей. Найдите их через поиск игроков."
          />
        )}

        {!f.loading && tab === 'incoming' && (
          <IncomingList
            items={f.incoming}
            onOpenProfile={openProfile}
            onAccept={f.accept}
            onDecline={f.decline}
            emptyText="Входящих заявок нет"
          />
        )}

        {!f.loading && tab === 'outgoing' && (
          <OutgoingList
            items={f.outgoing}
            onOpenProfile={openProfile}
            onCancel={f.cancel}
            emptyText="Вы никого не приглашали в друзья"
          />
        )}
      </div>
    </div>
  );
}

// ─── Аватар ───

function Avatar({ url, name }: { url: string | null; name: string }) {
  const initial = name?.[0]?.toUpperCase() ?? '👤';
  return (
    <span className="friend-avatar">
      {url ? (
        <img
          src={url}
          alt={name}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : null}
      <span className="friend-avatar-fallback">{initial}</span>
    </span>
  );
}

// ─── Список друзей ───

function FriendsList({
  items,
  onOpenProfile,
  onRemove,
  emptyText,
}: {
  items: FriendDto[];
  onOpenProfile: (userId: string) => void;
  onRemove: (id: string) => void;
  emptyText: string;
}) {
  const confirm = useConfirm();

  if (items.length === 0) {
    return (
      <div className="page-empty">
        <div className="page-empty-text">{emptyText}</div>
      </div>
    );
  }

  const handleRemove = async (userId: string, username: string) => {
    const ok = await confirm({
      title: `Удалить ${username} из друзей?`,
      confirmLabel: 'Удалить',
      danger: true,
    });
    if (ok) onRemove(userId);
  };

  return (
    <div className="friends-list">
      {items.map((u) => {
        const emoji = TIER_EMOJI[u.tier] ?? '🏆';
        return (
          <div key={u.userId} className="friend-row">
            <button
              className="friend-row-info"
              onClick={() => onOpenProfile(u.userId)}
            >
              <Avatar url={u.avatarUrl} name={u.username} />
              <span className="friend-name">{u.username}</span>
              <span className="friend-rating">
                <span>{emoji}</span>
                <b>{u.rating}</b>
                <span className="friend-tier">{u.tier}</span>
              </span>
            </button>
            <button
              className="friend-remove"
              onClick={() => void handleRemove(u.userId, u.username)}
              title="Удалить из друзей"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Входящие ───

function IncomingList({
  items,
  onOpenProfile,
  onAccept,
  onDecline,
  emptyText,
}: {
  items: FriendRequestDto[];
  onOpenProfile: (userId: string) => void;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
  emptyText: string;
}) {
  if (items.length === 0) {
    return (
      <div className="page-empty">
        <div className="page-empty-text">{emptyText}</div>
      </div>
    );
  }
  return (
    <div className="friends-list">
      {items.map((r) => (
        <div key={r.id} className="friend-row">
          <button
            className="friend-row-info"
            onClick={() => onOpenProfile(r.userId)}
          >
            <Avatar url={r.avatarUrl} name={r.username} />
            <span className="friend-name">{r.username}</span>
          </button>
          <button
            className="friend-action friend-action-accept"
            onClick={() => onAccept(r.id)}
          >
            Принять
          </button>
          <button
            className="friend-action friend-action-decline"
            onClick={() => onDecline(r.id)}
          >
            Отклонить
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Исходящие ───

function OutgoingList({
  items,
  onOpenProfile,
  onCancel,
  emptyText,
}: {
  items: FriendRequestDto[];
  onOpenProfile: (userId: string) => void;
  onCancel: (id: string) => void;
  emptyText: string;
}) {
  if (items.length === 0) {
    return (
      <div className="page-empty">
        <div className="page-empty-text">{emptyText}</div>
      </div>
    );
  }
  return (
    <div className="friends-list">
      {items.map((r) => (
        <div key={r.id} className="friend-row">
          <button
            className="friend-row-info"
            onClick={() => onOpenProfile(r.userId)}
          >
            <Avatar url={r.avatarUrl} name={r.username} />
            <span className="friend-name">{r.username}</span>
            <span className="friend-pending">Ожидает ответа</span>
          </button>
          <button
            className="friend-action friend-action-decline"
            onClick={() => onCancel(r.id)}
          >
            Отменить
          </button>
        </div>
      ))}
    </div>
  );
}