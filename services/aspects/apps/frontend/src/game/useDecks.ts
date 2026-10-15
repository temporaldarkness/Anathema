import { useCallback, useEffect, useState } from 'react';
import type { DeckDto, CreateDeckDto } from '@aspects/shared';
import { decksApi } from './decksApi';
import type { AuthState } from './useAuth';

const LS_KEY = 'aspects.decks.v1';

function migrateLocal(d: any): DeckDto {
  const series: string[] = d.series;
  return {
    ...d,
    series,
  } as DeckDto;
}

function loadLocal(): DeckDto[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    return (JSON.parse(raw) as any[]).map(migrateLocal);
  } catch {
    return [];
  }
}

function saveLocal(decks: DeckDto[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(decks));
}

function makeLocalId(): string {
  return `local-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

export interface UseDecksResult {
  decks: DeckDto[];
  loading: boolean;
  error: string | null;
  isLocal: boolean;
  reload: () => void;
  create: (dto: CreateDeckDto) => Promise<DeckDto>;
  update: (id: string, dto: CreateDeckDto) => Promise<DeckDto>;
  remove: (id: string) => Promise<void>;
}

export function useDecks(auth: AuthState): UseDecksResult {
  const [decks, setDecks] = useState<DeckDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isAnonymous = auth.kind === 'anonymous';
  const isReady = auth.kind !== 'loading';

  const reload = useCallback(async () => {
    if (!isReady) return;
    setLoading(true);
    setError(null);

    if (isAnonymous) {
      setDecks(loadLocal());
      setLoading(false);
      return;
    }

    try {
      const list = await decksApi.list();
      setDecks(list);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [isAnonymous, isReady]);

  useEffect(() => {
    reload();
  }, [reload]);

  const create = useCallback(
    async (dto: CreateDeckDto): Promise<DeckDto> => {
      if (isAnonymous) {
        const now = new Date().toISOString();
        const deck: DeckDto = {
          id: makeLocalId(),
          ownerId: 'anonymous',
          name: dto.name,
          description: dto.description ?? '',
          series: dto.series,
          cardIds: [...dto.cardIds],
          createdAt: now,
          updatedAt: now,
        };
        const next = [deck, ...decks];
        saveLocal(next);
        setDecks(next);
        return deck;
      }

      const deck = await decksApi.create(dto);
      setDecks((prev) => [deck, ...prev]);
      return deck;
    },
    [isAnonymous, decks],
  );

  const update = useCallback(
    async (id: string, dto: CreateDeckDto): Promise<DeckDto> => {
      if (isAnonymous) {
        const idx = decks.findIndex((d) => d.id === id);
        if (idx < 0) throw new Error('Deck not found');
        const updated: DeckDto = {
          ...decks[idx],
          name: dto.name,
          description: dto.description ?? '',
          series: dto.series,
          cardIds: [...dto.cardIds],
          updatedAt: new Date().toISOString(),
        };
        const next = [...decks];
        next[idx] = updated;
        saveLocal(next);
        setDecks(next);
        return updated;
      }

      const deck = await decksApi.update(id, dto);
      setDecks((prev) => prev.map((d) => (d.id === id ? deck : d)));
      return deck;
    },
    [isAnonymous, decks],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      if (isAnonymous) {
        const next = decks.filter((d) => d.id !== id);
        saveLocal(next);
        setDecks(next);
        return;
      }

      await decksApi.remove(id);
      setDecks((prev) => prev.filter((d) => d.id !== id));
    },
    [isAnonymous, decks],
  );

  return {
    decks,
    loading,
    error,
    isLocal: isAnonymous,
    reload,
    create,
    update,
    remove,
  };
}