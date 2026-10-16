import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  allCardIds,
  type Command,
  type GameState,
  type GameEvent,
  type CardInstanceId,
  type PlayerId,
} from '@aspects/engine';
import type { RoomPublicInfo } from '@aspects/shared';
import { makeLogEntry, resetLogIdCounter, type LogEntry } from './logEntry';
import { positionKey, guildKey, type Floating } from './floatings';
import { decodeAnonName } from './anonId';

interface PositionSnapshot {
  column: number | null;
  ownerId: PlayerId;
  zone: 'FRONT' | 'RESERVE' | 'HAND' | 'DECK' | 'DISCARD';
}

export type OnlineStatus =
  | { kind: 'idle' }
  | { kind: 'connecting' }
  | { kind: 'subscribed'; myPlayerId: PlayerId }
  | { kind: 'error'; reason: string };

export type RematchNotice =
  | { kind: 'declined'; byName: string }
  | { kind: 'expired' };

export interface OpponentLeftState {
  side: PlayerId;
  name: string;
}

export interface RatingUpdate {
  side: 'winner' | 'loser';
  delta: string;
  after: number;
  tier: string;
}

export interface UseOnlineGameResult {
  status: OnlineStatus;
  state: GameState | null;
  version: number;
  roomInfo: RoomPublicInfo | null;
  log: LogEntry[];
  floatings: Floating[];
  myPlayerId: PlayerId | null;
  opponentHandCount: number | null;
  isMyTurn: boolean;
  turnDeadlineAt: number | null;
  turnOwner: 'p1' | 'p2' | null;
  rematchProposedBy: PlayerId | null;
  rematchNotice: RematchNotice | null;
  opponentLeft: OpponentLeftState | null;
  opponentExpired: boolean;
  dispatch: (cmd: Command) => void;
  concede: () => void;
  proposeRematch: () => void;
  respondRematch: (accept: boolean) => void;
  dismissRematchNotice: () => void;
  dismissOpponentLeft: () => void;
  leave: () => void;
  clearError: () => void;
  myRole: 'player' | 'spectator';
  ratingUpdate: RatingUpdate | null;
}

interface Options {
  roomCode: string;
  userId: string;
  role?: 'player' | 'spectator';
  onGameOver?: (winner: string, reason: string) => void;
}

const SUBSCRIBE_TIMEOUT_MS = 4000;
const SUBSCRIBE_MAX_ATTEMPTS = 3;

export function useOnlineGame(opts: Options): UseOnlineGameResult {
  const { roomCode, userId, role = 'player', onGameOver } = opts;

  const [state, setState] = useState<GameState | null>(null);
  const [version, setVersion] = useState(0);
  const [roomInfo, setRoomInfo] = useState<RoomPublicInfo | null>(null);
  const [status, setStatus] = useState<OnlineStatus>({ kind: 'connecting' });
  const [log, setLog] = useState<LogEntry[]>([]);
  const [floatings, setFloatings] = useState<Floating[]>([]);
  const [myPlayerId, setMyPlayerId] = useState<PlayerId | null>(null);
  const [opponentHandCount, setOpponentHandCount] = useState<number | null>(null);
  const [turnDeadlineAt, setTurnDeadlineAt] = useState<number | null>(null);
  const [turnOwner, setTurnOwner] = useState<'p1' | 'p2' | null>(null);
  const [rematchProposedBy, setRematchProposedBy] = useState<PlayerId | null>(null);
  const [rematchNotice, setRematchNotice] = useState<RematchNotice | null>(null);
  const [opponentLeft, setOpponentLeft] = useState<OpponentLeftState | null>(null);
  const [opponentExpired, setOpponentExpired] = useState(false);
  const [myRole, setMyRole] = useState<'player' | 'spectator'>(role);
  const [ratingUpdate, setRatingUpdate] = useState<RatingUpdate | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const versionRef = useRef(0);
  const stateRef = useRef<GameState | null>(null);
  const logIdRef = useRef(0);
  const myPlayerIdRef = useRef<PlayerId | null>(null);

  const proposeRematch = useCallback(() => {
    socketRef.current?.emit('rematch_propose');
  }, []);

  const respondRematch = useCallback((accept: boolean) => {
    socketRef.current?.emit('rematch_respond', { accept });
  }, []);

  const dismissRematchNotice = useCallback(() => {
    setRematchNotice(null);
  }, []);

  const dismissOpponentLeft = useCallback(() => {
    setOpponentLeft(null);
  }, []);

  const isMyTurn = useMemo(() => {
    if (!state || !myPlayerId) return false;
    if (state.winner) return false;
    if (state.pendingChoice) return state.pendingChoice.playerId === myPlayerId;
    return state.activePlayer === myPlayerId;
  }, [state, myPlayerId]);

  const processEvents = useCallback(
    (events: GameEvent[], prevState: GameState | null, newState: GameState) => {
      if (events.length === 0) return;

      const newLines: LogEntry[] = [];
      for (const e of events) {
        const entry = makeLogEntry(newState, e);
        if (entry) {
          logIdRef.current += 1;
          newLines.push({ ...entry, id: logIdRef.current });
        }
      }
      if (newLines.length > 0) {
        setLog((l) => [...l, ...newLines].slice(-300));
      }

      const adds: Floating[] = [];
      let counter = Date.now();

      const snapshot = new Map<CardInstanceId, PositionSnapshot>();
      if (prevState) {
        for (const id of allCardIds(prevState)) {
          const c = prevState.cards[id];
          snapshot.set(id, { column: c.column, ownerId: c.ownerId, zone: c.zone });
        }
      }

      const resolvePos = (cardId: CardInstanceId): PositionSnapshot | null => {
        const after = newState.cards[cardId];
        if (after && after.column != null && (after.zone === 'FRONT' || after.zone === 'RESERVE')) {
          return { column: after.column, ownerId: after.ownerId, zone: after.zone };
        }
        const snap = snapshot.get(cardId);
        if (snap && snap.column != null && (snap.zone === 'FRONT' || snap.zone === 'RESERVE')) {
          return snap;
        }
        return null;
      };

      for (const e of events) {
        if (e.type === 'DAMAGE_DEALT') {
          const pos = resolvePos(e.targetId);
          if (!pos) continue;
          const key = positionKey(pos.column, pos.ownerId, pos.zone as any);
          if (!key) continue;
          adds.push({ id: counter++, position: key, text: `-${e.amount}`, color: '#ff5c5c' });
        } else if (e.type === 'DAMAGE_ABSORBED') {
          const pos = resolvePos(e.targetId);
          if (!pos) continue;
          const key = positionKey(pos.column, pos.ownerId, pos.zone as any);
          if (!key) continue;
          adds.push({ id: counter++, position: key, text: `🛡${e.absorbed}`, color: '#8ec5ff' });
        } else if (e.type === 'SHIELD_ABSORBED') {
          const pos = resolvePos(e.cardId);
          if (!pos) continue;
          const key = positionKey(pos.column, pos.ownerId, pos.zone as any);
          if (!key) continue;
          adds.push({ id: counter++, position: key, text: '🛡', color: '#8ec5ff' });
        } else if (e.type === 'TOKEN_SUMMONED') {
          if (e.destination === 'FRONT' || e.destination === 'RESERVE') {
            const key = positionKey(e.column ?? null, e.ownerId, e.destination);
            if (key) adds.push({ id: counter++, position: key, text: '✨', color: '#c0a0ff' });
          }
        } else if (e.type === 'NEUTRAL_CAPTURED') {
          adds.push({
            id: counter++,
            position: `${e.column}:neutral:FRONT`,
            text: '🚩',
            color: e.playerId === 'p1' ? '#8ec5ff' : '#ff9b9b',
          });
        } else if (e.type === 'CARD_HEALED') {
          const pos = resolvePos(e.cardId);
          if (!pos) continue;
          const key = positionKey(pos.column, pos.ownerId, pos.zone as any);
          if (!key) continue;
          adds.push({ id: counter++, position: key, text: `+${e.amount}`, color: '#8ee09e' });
        } else if (e.type === 'CARD_SILENCED') {
          const pos = resolvePos(e.cardId);
          if (!pos) continue;
          const key = positionKey(pos.column, pos.ownerId, pos.zone as any);
          if (!key) continue;
          adds.push({ id: counter++, position: key, text: '🔇', color: '#c0a0ff' });
        } else if (e.type === 'GLORY_CHANGED' && e.delta < 0) {
          adds.push({
            id: counter++,
            position: guildKey(e.playerId),
            text: `${e.delta}`,
            color: '#ff5c5c',
          });
        }
      }

      if (adds.length > 0) {
        setFloatings((prev) => [...prev, ...adds]);
        const ids = new Set(adds.map((a) => a.id));
        setTimeout(() => {
          setFloatings((prev) => prev.filter((a) => !ids.has(a.id)));
        }, 1300);
      }
    },
    [],
  );

  useEffect(() => {
    if (!roomCode || !userId) return;

    resetLogIdCounter();
    logIdRef.current = 0;
    stateRef.current = null;
    versionRef.current = 0;
    myPlayerIdRef.current = null;
    setState(null);
    setStatus({ kind: 'connecting' });
    setRematchProposedBy(null);
    setRematchNotice(null);
    setOpponentLeft(null);
    setOpponentExpired(false);
	setRatingUpdate(null);

    const socket = io('/', {
      path: '/games/aspects/ws/socket.io',
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    const trySubscribe = () => {
      attempts++;
      socket.emit('subscribe', { roomCode, role });

      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(() => {
        if (stateRef.current !== null) return;
        if (attempts < SUBSCRIBE_MAX_ATTEMPTS) {
          trySubscribe();
        } else {
          setStatus({ kind: 'error', reason: 'Не удалось получить состояние комнаты' });
        }
      }, SUBSCRIBE_TIMEOUT_MS);
    };

    socket.on('connect', () => {
      attempts = 0;
      trySubscribe();
    });
	
	socket.on('rating_updated', (payload: RatingUpdate) => {
	  setRatingUpdate(payload);
	});

    socket.on('disconnect', () => {
      if (stateRef.current === null) setStatus({ kind: 'connecting' });
    });

    socket.on('connect_error', (err) => {
      setStatus({ kind: 'error', reason: err.message });
    });

    socket.on('state_sync', (payload: any) => {
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      const prev = stateRef.current;
      const prevWinner = prev?.winner ?? null;
      stateRef.current = payload.state;
      versionRef.current = payload.version;
      setState(payload.state);
      setVersion(payload.version);
      setRoomInfo(payload.roomInfo);
      const pid: PlayerId | null = payload.myPlayerId ?? null;
      setMyPlayerId(pid);
      myPlayerIdRef.current = pid;
	  if (payload.role === 'spectator' || payload.role === 'player') {
	    setMyRole(payload.role);
      }
      setOpponentHandCount(payload.opponentHandCount ?? null);
      setTurnDeadlineAt(payload.turnDeadlineAt ?? null);
      setTurnOwner(payload.turnOwner ?? null);
      setRematchProposedBy(payload.rematchProposedBy ?? null);
      setStatus({ kind: 'subscribed', myPlayerId: payload.myPlayerId ?? 'p1' });
	  
	  if (payload.role === 'spectator' || payload.role === 'player') {
        setMyRole(payload.role);
      }

      if (prevWinner && !payload.state.winner) {
        setRematchNotice(null);
        setOpponentLeft(null);
      }

      if (payload.events && payload.events.length > 0) {
        processEvents(payload.events, prev, payload.state);
      }
    });

    socket.on('state_update', (payload: any) => {
      const prev = stateRef.current;
      const prevWinner = prev?.winner ?? null;
      stateRef.current = payload.state;
      versionRef.current = payload.version;
      setState(payload.state);
      setVersion(payload.version);
      if (payload.myPlayerId) {
        setMyPlayerId(payload.myPlayerId);
        myPlayerIdRef.current = payload.myPlayerId;
      }
      if (payload.opponentHandCount != null) setOpponentHandCount(payload.opponentHandCount);
      if (payload.turnDeadlineAt !== undefined) setTurnDeadlineAt(payload.turnDeadlineAt ?? null);
      if (payload.turnOwner !== undefined) setTurnOwner(payload.turnOwner ?? null);
      if (payload.rematchProposedBy !== undefined) {
        setRematchProposedBy(payload.rematchProposedBy ?? null);
      }

      if (prevWinner && !payload.state.winner) {
        setRematchNotice(null);
        setOpponentLeft(null);
      }

      processEvents(payload.events, prev, payload.state);
    });

    socket.on('command_error', (payload: any) => {
      console.warn('[ws] command_error', payload);
      setStatus({ kind: 'error', reason: payload.reason });
      setTimeout(() => {
        setStatus((s) => {
          if (s.kind !== 'error') return s;
          const pid = myPlayerIdRef.current;
          if (!pid) return { kind: 'connecting' };
          return { kind: 'subscribed', myPlayerId: pid };
        });
      }, 2000);
    });

    socket.on(
      'rematch_update',
      (payload: {
        proposedBy: PlayerId | null;
        event: 'sync' | 'proposed' | 'declined' | 'expired';
        byName?: string;
      }) => {
        setRematchProposedBy(payload.proposedBy ?? null);
        if (payload.event === 'declined') {
          setRematchNotice({
            kind: 'declined',
            byName: decodeAnonName(payload.byName),
          });
        } else if (payload.event === 'expired') {
          setRematchNotice({ kind: 'expired' });
        } else {
          setRematchNotice(null);
        }
      },
    );

    socket.on('opponent_left', (payload: { side: PlayerId; name?: string }) => {
      setOpponentLeft({
        side: payload.side,
        name: decodeAnonName(payload.name) || 'Соперник',
      });
    });

    socket.on('opponent_joined', (payload: { side: PlayerId; name: string }) => {
      setOpponentLeft(null);
      // Мгновенно сбрасываем «офлайн»-флаги в локальном roomInfo —
      // даже если state_sync ещё не пришёл.
      setRoomInfo((prev) => {
        if (!prev) return prev;
        const next = { ...prev };
        if (payload.side === 'p1') {
          next.ownerDisconnectedAt = null;
          if (next.takeoverOpenFor === 'p1') next.takeoverOpenFor = null;
        } else {
          next.guestDisconnectedAt = null;
          if (next.takeoverOpenFor === 'p2') next.takeoverOpenFor = null;
        }
        return next;
      });
    });

    socket.on('room_expired', () => {
      setOpponentExpired(true);
    });

    socket.on('guest_joined', (payload: any) => {
      const room = payload.roomInfo
        ? { ...payload.roomInfo, guestName: decodeAnonName(payload.roomInfo.guestName) }
        : payload.roomInfo;
      setRoomInfo(room);
    });

    socket.on('guest_left', (payload: any) => {
      setLog((l) => [
        ...l,
        {
          id: ++logIdRef.current,
          kind: 'turn',
          text: `${decodeAnonName(payload.guestName)} покинул партию`,
        },
      ]);
    });

    socket.on('game_over', (payload: any) => {
      onGameOver?.(payload.winner, payload.reason);
    });

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, userId]);

  const dispatch = useCallback((cmd: Command) => {
    socketRef.current?.emit('command', {
      command: cmd,
      expectedVersion: versionRef.current,
    });
  }, []);

  const concede = useCallback(() => {
    socketRef.current?.emit('concede');
  }, []);

  const leave = useCallback(() => {
    socketRef.current?.disconnect();
  }, []);

  const clearError = useCallback(() => {
    setStatus((s) =>
      s.kind === 'error'
        ? { kind: 'subscribed', myPlayerId: myPlayerIdRef.current ?? 'p1' }
        : s,
    );
  }, []);

  return {
    status,
    state,
    version,
    roomInfo,
    log,
    floatings,
    myPlayerId,
    opponentHandCount,
    isMyTurn,
    turnDeadlineAt,
    turnOwner,
    rematchProposedBy,
    rematchNotice,
    opponentLeft,
    opponentExpired,
    dispatch,
    concede,
    proposeRematch,
    respondRematch,
    dismissRematchNotice,
    dismissOpponentLeft,
    leave,
    clearError,
	myRole,
	ratingUpdate,
  };
}