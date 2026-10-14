import { useCallback, useEffect, useState } from 'react';
import type { MatchSummaryDto } from '@aspects/shared';
import { matchesApi } from './matchesApi';
import type { AuthState } from './useAuth';

export interface UseMatchesResult {
  matches: MatchSummaryDto[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useMatches(auth: AuthState): UseMatchesResult {
  const [matches, setMatches] = useState<MatchSummaryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isReady = auth.kind !== 'loading';
  const isAnonymous = auth.kind === 'anonymous';

  const reload = useCallback(async () => {
    if (!isReady) return;
    if (isAnonymous) {
      setMatches([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await matchesApi.list();
      setMatches(list);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [isReady, isAnonymous]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { matches, loading, error, reload };
}