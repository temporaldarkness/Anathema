export interface PublicRating {
  rating: number;
  rd: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  tier: string;
}

const API_BASE = '/games/aspects/api';

async function request<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export interface BotRatingEntry {
  botId: string;
  rating: number;
  rd: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
}

export const ratingApi = {
  me(): Promise<PublicRating> {
    return request<PublicRating>('/rating/me');
  },
  byUser(userId: string): Promise<PublicRating> {
    return request<PublicRating>(`/rating/${encodeURIComponent(userId)}`);
  },
  allBots(): Promise<BotRatingEntry[]> {
    return request<BotRatingEntry[]>('/rating/bots/all');
  },
  
  historyMe(limit = 20): Promise<RatingHistoryEntry[]> {
    return request<RatingHistoryEntry[]>(`/rating/history/me?limit=${limit}`);
  },
  historyOf(userId: string, limit = 20): Promise<RatingHistoryEntry[]> {
    return request<RatingHistoryEntry[]>(
      `/rating/${encodeURIComponent(userId)}/history?limit=${limit}`,
    );
  },
};

export interface RatingHistoryEntry {
  id: string;
  playedAt: string;
  opponentId: string;
  opponentName: string;
  result: 'win' | 'loss' | 'draw';
  ratingBefore: number;
  ratingAfter: number;
  delta: number;
}