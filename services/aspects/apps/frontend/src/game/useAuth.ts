import { useEffect, useState } from 'react';
import { decodeAnonName, getAnonName } from './anonId';

export interface CurrentUser {
  id: string;
  username: string;
  isAdmin: boolean;
  avatarUrl?: string | null;
}

export interface AnonymousUser {
  anonId: string;
  anonName: string;
}

export type AuthState =
  | { kind: 'loading' }
  | { kind: 'anonymous'; anonId: string; anonName: string }
  | { kind: 'authenticated'; user: CurrentUser };

interface SessionResponse {
  kind: 'authenticated' | 'anonymous';
  user?: CurrentUser;
  anonId?: string;
  anonName?: string;
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;

    fetch('/games/aspects/api/session', { credentials: 'include' })
      .then((r) => r.json() as Promise<SessionResponse>)
      .then(async (s) => {
        if (cancelled) return;
        if (s.kind === 'authenticated' && s.user) {
          setState({
            kind: 'authenticated',
            user: {
              id: s.user.id,
              username: s.user.username,
              isAdmin: !!s.user.isAdmin,
              avatarUrl: s.user.avatarUrl ?? null,
            },
          });
          return;
        }

        const serverName = s.anonName ?? 'Аноним';
        const localName = getAnonName();

        if (localName && localName !== serverName) {
          try {
            await fetch('/games/aspects/api/session/name', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: localName }),
            });
          } catch {
            /* не критично — перезапишем при следующем заходе */
          }
        }

        const effectiveName = localName ?? serverName;

        setState({
          kind: 'anonymous',
          anonId: s.anonId ?? 'unknown',
          anonName: decodeAnonName(effectiveName),
        });
      })
      .catch(() => {
        if (!cancelled) {
          const localName = getAnonName();
          setState({
            kind: 'anonymous',
            anonId: 'unknown',
            anonName: decodeAnonName(localName ?? 'Аноним'),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}