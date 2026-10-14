import { useCallback, useEffect, useState } from 'react';
import type { AuthState } from './useAuth';
import {
  friendsApi,
  type FriendDto,
  type FriendRequestDto,
} from './friendsApi';

export interface UseFriendsResult {
  friends: FriendDto[];
  incoming: FriendRequestDto[];
  outgoing: FriendRequestDto[];
  loading: boolean;
  reload: () => void;
  sendRequest: (userId: string) => Promise<void>;
  accept: (id: string) => Promise<void>;
  decline: (id: string) => Promise<void>;
  cancel: (id: string) => Promise<void>;
  remove: (friendId: string) => Promise<void>;
}

export function useFriends(auth: AuthState): UseFriendsResult {
  const [friends, setFriends] = useState<FriendDto[]>([]);
  const [incoming, setIncoming] = useState<FriendRequestDto[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequestDto[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(() => {
    if (auth.kind !== 'authenticated') {
      setFriends([]);
      setIncoming([]);
      setOutgoing([]);
      return;
    }
    setLoading(true);
    Promise.all([
      friendsApi.list(),
      friendsApi.incoming(),
      friendsApi.outgoing(),
    ])
      .then(([f, i, o]) => {
        setFriends(f);
        setIncoming(i);
        setOutgoing(o);
      })
      .catch(() => {
        /* пусто */
      })
      .finally(() => setLoading(false));
  }, [auth.kind]);

  useEffect(() => {
    reload();
  }, [reload]);

  const wrap = <T extends unknown[]>(
    fn: (...args: T) => Promise<unknown>,
  ) => {
    return async (...args: T): Promise<void> => {
      try {
        await fn(...args);
      } catch (e) {
        console.warn('[friends] op failed', e);
      }
      reload();
    };
  };

  return {
    friends,
    incoming,
    outgoing,
    loading,
    reload,
    sendRequest: wrap(friendsApi.request),
    accept: wrap(friendsApi.accept),
    decline: wrap(friendsApi.decline),
    cancel: wrap(friendsApi.cancel),
    remove: wrap(friendsApi.remove),
  };
}