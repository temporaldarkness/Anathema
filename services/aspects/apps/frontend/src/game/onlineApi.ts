import type {
  RoomPublicInfo,
  CreateRoomDto,
  JoinRoomDto,
} from '@aspects/shared';
import { getAnonName } from './anonId';

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

export const onlineApi = {
  createRoom(dto: CreateRoomDto): Promise<RoomPublicInfo> {
    return request<RoomPublicInfo>('/rooms', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  joinRoom(code: string, dto: JoinRoomDto): Promise<RoomPublicInfo> {
    return request<RoomPublicInfo>(`/rooms/${code}/join`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  getRoom(code: string): Promise<RoomPublicInfo | null> {
    return request<RoomPublicInfo | null>(`/rooms/${code}`);
  },

  listMine(): Promise<RoomPublicInfo[]> {
    return request<RoomPublicInfo[]>('/rooms');
  },

  leave(code: string): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(`/rooms/${code}`, { method: 'DELETE' });
  },
  
  inviteFriends(code: string, userIds: string[]): Promise<{ invited: number; skipped: number }> {
    return request<{ invited: number; skipped: number }>(`/rooms/${code}/invite`, {
      method: 'POST',
      body: JSON.stringify({ userIds }),
    });
  },
  
  allowTakeover(code: string, seat: 'p1' | 'p2'): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(`/rooms/${code}/allow-takeover`, {
      method: 'POST',
      body: JSON.stringify({ seat }),
    });
  },
  
  takeover(code: string, seat: 'p1' | 'p2'): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(`/rooms/${code}/takeover`, {
      method: 'POST',
      body: JSON.stringify({ seat }),
    });
  },
};