export interface PublicUser {
  userId: string; 
  username: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  rating: number;
  tier: string;
  rd: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
}

const API_BASE = '/games/aspects/api';

async function request<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export const usersApi = {
  getPublic(userId: string): Promise<PublicUser> {
    return request<PublicUser>(`/users/${encodeURIComponent(userId)}`);
  },
  search(q: string, limit = 20): Promise<PublicUser[]> {
    return request<PublicUser[]>(
      `/users/search?q=${encodeURIComponent(q)}&limit=${limit}`,
    );
  },
  leaderboard(limit = 100): Promise<LeaderboardEntry[]> {
    return request<LeaderboardEntry[]>(`/users/leaderboard?limit=${limit}`);
  },
};

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  rating: number;
  rd: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  tier: string;
}