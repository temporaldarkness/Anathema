import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFriends } from '../game/useFriends';
import type { AuthState } from '../game/useAuth';
import type { FriendDto } from '../game/friendsApi';

interface Props {
  open: boolean;
  auth: AuthState;
  /** Уже в комнате — их повторно не приглашаем. */
  alreadyInRoom?: string[];
  onInvite: (userIds: string[]) => Promise<void>;
  onClose: () => void;
}

export function InviteFriendsModal({
  open,
  auth,
  alreadyInRoom = [],
  onInvite,
  onClose,
}: Props) {
  const friends = useFriends(auth);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSelected(new Set());
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleInvite = async () => {
    if (selected.size === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onInvite([...selected]);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="theme-modal-overlay" onClick={onClose}>
      <div
        className="theme-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 520 }}
      >
        <div className="theme-modal-header">
          <h2 className="theme-modal-title">Пригласить друзей</h2>
          <button className="theme-modal-close" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </div>
        <div className="invite-modal-body">
          {friends.loading && (
            <div className="theme-modal-loading">Загрузка…</div>
          )}
          {!friends.loading && friends.friends.length === 0 && (
            <div className="theme-modal-loading">
              У вас пока нет друзей. Найдите их через поиск игроков.
            </div>
          )}
          {!friends.loading && friends.friends.length > 0 && (
            <div className="invite-list">
              {friends.friends.map((f: FriendDto) => {
                const inRoom = alreadyInRoom.includes(f.userId);
                const checked = selected.has(f.userId);
                return (
                  <button
                    key={f.userId}
                    className={`invite-row ${checked ? 'invite-row-selected' : ''} ${inRoom ? 'invite-row-disabled' : ''}`}
                    onClick={() => !inRoom && toggle(f.userId)}
                    disabled={inRoom}
                  >
                    <span className={`invite-check ${checked ? 'invite-check-on' : ''}`}>
                      {checked ? '✓' : ''}
                    </span>
                    <span className="friend-avatar">
                      {f.avatarUrl ? (
                        <img
                          src={f.avatarUrl}
                          alt={f.username}
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : null}
                      <span className="friend-avatar-fallback">
                        {f.username[0]?.toUpperCase() ?? '👤'}
                      </span>
                    </span>
                    <span className="friend-name">{f.username}</span>
                    {inRoom && <span className="invite-in-room">уже в комнате</span>}
                  </button>
                );
              })}
            </div>
          )}

          {error && <div className="invite-error">{error}</div>}
        </div>
        <div className="invite-modal-footer">
          <button className="btn-header" onClick={onClose}>
            Отмена
          </button>
          <button
            className="btn-header btn-primary"
            onClick={handleInvite}
            disabled={selected.size === 0 || busy}
          >
            {busy ? 'Отправка…' : `Пригласить (${selected.size})`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}