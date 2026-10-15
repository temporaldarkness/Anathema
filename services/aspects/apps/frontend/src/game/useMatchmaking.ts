import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { MatchmakingStatusDto } from '@aspects/shared';
import { matchmakingApi } from './matchmakingApi';
import { extractErrorMessage, localizeErrorMessage } from './errorMessage';

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'queued'; status: MatchmakingStatusDto; elapsedMs: number }
  | { kind: 'matched'; roomCode: string; opponentName: string; opponentIsBot: boolean }
  | { kind: 'error'; reason: string };

interface Options {
  /** Вызывается один раз при успешном матче. */
  onMatched: (roomCode: string, opponentName: string, opponentIsBot: boolean) => void;
}

export interface UseMatchmakingResult {
  state: State;
  enqueue: (series: string[], deckId: string, deckCards: string[]) => void;
  cancel: () => void;
}

const POLL_INTERVAL_MS = 2000;

export function useMatchmaking({ onMatched }: Options): UseMatchmakingResult {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const socketRef = useRef<Socket | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number>(0);
  const matchedRef = useRef(false);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const startPolling = useCallback(
    (series: string[]) => {
      startedAtRef.current = Date.now();

      // Раз в секунду обновляем elapsedMs.
      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = setInterval(() => {
        setState((s) =>
          s.kind === 'queued'
            ? { ...s, elapsedMs: Date.now() - startedAtRef.current }
            : s,
        );
      }, 1000);

      // Раз в 2 секунды тянем статус (позиция в очереди).
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const status = await matchmakingApi.status();
          if (!status.inQueue) {
            // Нас кто-то вынул, а WS-событие ещё не пришло — подстрахуемся.
            if (!matchedRef.current) {
              stopPolling();
              setState({
                kind: 'error',
                reason: 'Вы больше не в очереди',
              });
            }
            return;
          }
          setState((s) =>
            s.kind === 'queued'
              ? { ...s, status, elapsedMs: Date.now() - startedAtRef.current }
              : s,
          );
        } catch {
          /* тихо игнорируем сетевые ошибки в поллинге */
        }
      }, POLL_INTERVAL_MS);

      // Подтянем статус сразу — не ждать 2 секунды.
      matchmakingApi.status().then(
        (status) => {
          setState((s) =>
            s.kind === 'queued'
              ? { ...s, status, elapsedMs: Date.now() - startedAtRef.current }
              : s,
          );
        },
        () => {},
      );
    },
    [stopPolling],
  );

  // WS: слушаем matchmaking_found.
  useEffect(() => {
    const socket = io('/', {
      path: '/games/aspects/ws/socket.io',
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('matchmaking_found', (payload: {
      roomCode: string;
      opponentName?: string;
	  opponentIsBot?: boolean;
    }) => {
      if (matchedRef.current) return;
      matchedRef.current = true;
      stopPolling();
      setState({
        kind: 'matched',
        roomCode: payload.roomCode,
        opponentName: payload.opponentName ?? 'Соперник',
		opponentIsBot: !!payload.opponentIsBot,
      });
      onMatched(payload.roomCode, payload.opponentName ?? 'Соперник', !!payload.opponentIsBot);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Проверка статуса на маунте (перезашёл во время ожидания?).
  useEffect(() => {
    let cancelled = false;
    matchmakingApi
      .status()
      .then((status) => {
        if (cancelled) return;
        if (status.inQueue && status.series) {
          setState({
            kind: 'queued',
            status,
            elapsedMs: Date.now() - (status.queuedAt ?? Date.now()),
          });
          startPolling(status.series);
        }
      })
      .catch(() => {
        /* если статус не получили — просто показываем форму */
      });
    return () => {
      cancelled = true;
    };
  }, [startPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const enqueue = useCallback(
    async (series: string[], deckId: string, deckCards: string[]) => {
      if (state.kind === 'queued' || state.kind === 'loading') return;
      setState({ kind: 'loading' });
      try {
        const status = await matchmakingApi.enqueue({
          series,
          deckId,
          deckCards,
        });
        setState({ kind: 'queued', status, elapsedMs: 0 });
        startPolling(series);
      } catch (e) {
        setState({
          kind: 'error',
          reason: localizeErrorMessage(extractErrorMessage(e)),
        });
      }
    },
    [state.kind, startPolling],
  );

  const cancel = useCallback(() => {
    stopPolling();
    matchmakingApi.dequeue().catch(() => {});
    setState({ kind: 'idle' });
  }, [stopPolling]);

  return { state, enqueue, cancel };
}