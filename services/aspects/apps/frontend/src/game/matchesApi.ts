import type { SaveMatchDto, MatchSummaryDto, MatchDetailDto } from '@aspects/shared';

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

export const matchesApi = {
  save(dto: SaveMatchDto): Promise<MatchSummaryDto> {
    return request<MatchSummaryDto>('/matches', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  list(): Promise<MatchSummaryDto[]> {
    return request<MatchSummaryDto[]>('/matches');
  },

  get(id: string): Promise<MatchDetailDto> {
    return request<MatchDetailDto>(`/matches/${id}`);
  },
};