import { useCallback, useEffect, useState } from 'react';
import {
  ratingApi,
  type RatingHistoryEntry,
} from './ratingApi';

interface Options {
  /** Если задан — грузим историю конкретного игрока, иначе «мою». */
  userId?: string | null;
  /** Сколько записей тянуть. */
  limit?: number;
  /** Включить ли запрос (например, до авторизации). */
  enabled?: boolean;
}

export interface UseRatingHistoryResult {
  history: RatingHistoryEntry[];
  loading: boolean;
  reload: () => void;
}

export function useRatingHistory({
  userId = null,
  limit = 20,
  enabled = true,
}: Options = {}): UseRatingHistoryResult {
  const [history, setHistory] = useState<RatingHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(() => {
    if (!enabled) {
      setHistory([]);
      return;
    }
    setLoading(true);
    const p = userId ? ratingApi.historyOf(userId, limit) : ratingApi.historyMe(limit);
    p.then((list) => setHistory(list))
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, [userId, limit, enabled]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { history, loading, reload };
}