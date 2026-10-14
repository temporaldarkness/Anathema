import type { DeckDto, CreateDeckDto } from '@aspects/shared';

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

export const decksApi = {
  list(): Promise<DeckDto[]> {
    return request<DeckDto[]>('/decks');
  },

  create(dto: CreateDeckDto): Promise<DeckDto> {
    return request<DeckDto>('/decks', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  update(id: string, dto: CreateDeckDto): Promise<DeckDto> {
    return request<DeckDto>(`/decks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(dto),
    });
  },

  remove(id: string): Promise<void> {
    return request<void>(`/decks/${id}`, { method: 'DELETE' });
  },
};