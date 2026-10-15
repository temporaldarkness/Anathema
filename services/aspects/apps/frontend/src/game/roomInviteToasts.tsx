import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { io } from 'socket.io-client';
import type { AuthState } from './useAuth';

interface RoomInvite {
  id: number;
  roomCode: string;
  fromUserId: string;
  fromUsername: string;
  series: string[];
}

let counter = 0;

export function RoomInviteToasts({
  auth,
  onAccept,
}: {
  auth: AuthState;
  onAccept: (roomCode: string) => void;
}) {
  const [invites, setInvites] = useState<RoomInvite[]>([]);

  useEffect(() => {
    if (auth.kind !== 'authenticated') return;
    const socket = io('/', {
      path: '/games/aspects/ws/socket.io',
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });

    socket.on(
      'room_invite_received',
      (p: {
        roomCode: string;
        fromUserId: string;
        fromUsername: string;
        series: string[];
      }) => {
        const id = ++counter;
        setInvites((arr) => [...arr, { id, ...p }]);
        setTimeout(() => {
          setInvites((arr) => arr.filter((x) => x.id !== id));
        }, 30_000);
      },
    );

    return () => {
      socket.disconnect();
    };
  }, [auth.kind]);

  const dismiss = (id: number) =>
    setInvites((arr) => arr.filter((x) => x.id !== id));

  if (invites.length === 0) return null;

  return createPortal(
    <div className="global-toasts">
      {invites.map((inv) => (
        <div key={inv.id} className="friend-toast friend-toast-invite">
          <div className="invite-text">
            <b>{inv.fromUsername}</b> приглашает в комнату{' '}
            <b>{inv.roomCode}</b>
          </div>
          <div className="invite-actions">
            <button
              className="invite-btn-accept"
              onClick={() => {
                onAccept(inv.roomCode);
                dismiss(inv.id);
              }}
            >
              Присоединиться
            </button>
            <button
              className="invite-btn-dismiss"
              onClick={() => dismiss(inv.id)}
              aria-label="Отклонить"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>,
    document.body,
  );
}