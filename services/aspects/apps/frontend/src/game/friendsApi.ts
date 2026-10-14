export interface FriendDto {
  userId: string;
  username: string;
  avatarUrl: string | null;
  rating: number;
  tier: string;
}

export interface FriendRequestDto {
  id: string;
  userId: string;
  username: string;
  avatarUrl: string | null;
  rating: number;
  tier: string;
  createdAt: string;
}

export type RelationStatus =
  | { kind: 'self' }
  | { kind: 'none' }
  | { kind: 'friends'; requestId: string }
  | { kind: 'incoming'; requestId: string }
  | { kind: 'outgoing'; requestId: string };

const API_BASE = '/games/aspects/api';

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers ?? {}),
    },
    ...opts,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const friendsApi = {
  list(): Promise<FriendDto[]> {
    return request<FriendDto[]>('/friends');
  },
  incoming(): Promise<FriendRequestDto[]> {
    return request<FriendRequestDto[]>('/friends/requests/incoming');
  },
  outgoing(): Promise<FriendRequestDto[]> {
    return request<FriendRequestDto[]>('/friends/requests/outgoing');
  },
  status(targetId: string): Promise<RelationStatus> {
    return request<RelationStatus>(
      `/friends/status/${encodeURIComponent(targetId)}`,
    );
  },
  request(userId: string): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>('/friends/request', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  },
  accept(id: string): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(`/friends/requests/${id}/accept`, {
      method: 'POST',
    });
  },
  decline(id: string): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(`/friends/requests/${id}/decline`, {
      method: 'POST',
    });
  },
  cancel(id: string): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(`/friends/requests/${id}`, {
      method: 'DELETE',
    });
  },
  remove(friendId: string): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(
      `/friends/${encodeURIComponent(friendId)}`,
      { method: 'DELETE' },
    );
  },
};