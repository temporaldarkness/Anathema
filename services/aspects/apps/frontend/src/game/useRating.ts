import { useCallback, useEffect, useState } from 'react';
import type { AuthState } from './useAuth';
import { ratingApi, type PublicRating } from './ratingApi';

interface Options {
  auth: AuthState;
}

export interface UseRatingResult {
  rating: PublicRating | null;
  loading: boolean;
  reload: () => void;
}

export function useRating({ auth }: Options): UseRatingResult {
  const [rating, setRating] = useState<PublicRating | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(() => {
    if (auth.kind !== 'authenticated') {
      setRating(null);
      return;
    }
    setLoading(true);
    ratingApi
      .me()
      .then((r) => setRating(r))
      .catch(() => setRating(null))
      .finally(() => setLoading(false));
  }, [auth.kind]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { rating, loading, reload };
}