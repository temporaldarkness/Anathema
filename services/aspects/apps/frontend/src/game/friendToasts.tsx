import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { io } from 'socket.io-client';
import type { AuthState } from './useAuth';

interface Notice {
  id: number;
  kind: 'received' | 'accepted' | 'removed';
  text: string;
}

let counter = 0;

export function FriendToasts({ auth }: { auth: AuthState }) {
  const [notices, setNotices] = useState<Notice[]>([]);

  useEffect(() => {
    if (auth.kind !== 'authenticated') return;
    const socket = io('/', {
      path: '/games/aspects/ws/socket.io',
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });

    const push = (kind: Notice['kind'], text: string) => {
      const id = ++counter;
      setNotices((arr) => [...arr, { id, kind, text }]);
      setTimeout(() => {
        setNotices((arr) => arr.filter((n) => n.id !== id));
      }, 6000);
    };

    socket.on('friend_request_received', (p: { fromUsername?: string }) => {
      push('received', `${p.fromUsername ?? 'Игрок'} хочет добавить вас в друзья`);
    });
    socket.on('friend_request_accepted', (p: { byUsername?: string }) => {
      push('accepted', `${p.byUsername ?? 'Игрок'} принял вашу заявку`);
    });
    socket.on('friend_removed', () => {
      push('removed', 'Игрок удалил вас из друзей');
    });

    return () => {
      socket.disconnect();
    };
  }, [auth.kind]);

  if (notices.length === 0) return null;

  return createPortal(
    <div className="global-toasts">
      {notices.map((n) => (
        <div
          key={n.id}
          className={`friend-toast friend-toast-${n.kind}`}
          onClick={() => setNotices((arr) => arr.filter((x) => x.id !== n.id))}
        >
          {n.text}
        </div>
      ))}
    </div>,
    document.body,
  );
}