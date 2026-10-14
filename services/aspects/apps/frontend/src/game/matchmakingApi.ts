import type {
  MatchmakingStatusDto,
  MatchmakingQueueDto,
} from '@aspects/shared';

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

export const matchmakingApi = {
  enqueue(dto: MatchmakingQueueDto): Promise<MatchmakingStatusDto> {
    return request<MatchmakingStatusDto>('/matchmaking/queue', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  dequeue(): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>('/matchmaking/queue', {
      method: 'DELETE',
    });
  },

  status(): Promise<MatchmakingStatusDto> {
    return request<MatchmakingStatusDto>('/matchmaking/status');
  },
};