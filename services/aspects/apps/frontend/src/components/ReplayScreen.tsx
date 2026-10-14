import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createGame,
  applyCommand,
  allCardIds,
  type GameState,
  type Command,
  type CardInstanceId,
  type PlayerId,
} from '@aspects/engine';
import { getPack } from '@aspects/cards';
import type { MatchDetailDto } from '@aspects/shared';
import { matchesApi } from '../game/matchesApi';
import { Board } from './Board';
import { Hand } from './Hand';
import { PlayerPanel } from './PlayerPanel';
import { Log } from './Log';
import { makeLogEntry, resetLogIdCounter, type LogEntry } from '../game/logEntry';
import { positionKey, type Floating } from '../game/floatings';

interface Props {
  matchId: string;
  onBack: () => void;
}

interface ReplayFrame {
  state: GameState;
  events: any[];
}

function buildFrames(match: MatchDetailDto): ReplayFrame[] {
  const pack = getPack(match.packId);
  const initial = createGame({
    seed: match.seed,
    decks: { p1: match.deckP1, p2: match.deckP2 },
    cardDefinitions: pack.cardsById,
    useMulligan: true,
  });

  const frames: ReplayFrame[] = [
    { state: initial.state, events: initial.events },
  ];

  let current = initial.state;
  for (const c of match.commands) {
    try {
      const r = applyCommand(current, c.command as Command);
      current = r.state;
      frames.push({ state: r.state, events: r.events });
    } catch (e) {
      console.warn('Replay stopped on command', c, e);
      break;
    }
  }

  if (match.winnerId && !current.winner) {
    const finalState: GameState = {
      ...current,
      winner: match.winnerId as PlayerId,
      winnerReason: match.winnerReason ?? null,
    };
    frames.push({ state: finalState, events: [] });
  }

  return frames;
}

export function ReplayScreen({ matchId, onBack }: Props) {
  const [match, setMatch] = useState<MatchDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    matchesApi
      .get(matchId)
      .then((m) => {
        if (!cancelled) setMatch(m);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  if (loading) return <div className="decks-loading">Загрузка…</div>;
  if (error || !match) return <div className="decks-error">Ошибка: {error}</div>;

  return <ReplayView match={match} onBack={onBack} />;
}

interface PositionSnapshot {
  column: number | null;
  ownerId: PlayerId;
  zone: 'FRONT' | 'RESERVE' | 'HAND' | 'DECK' | 'DISCARD';
}

function buildFloatingsFromFrame(
  prevState: GameState | null,
  frame: ReplayFrame,
): Floating[] {
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
    const after = frame.state.cards[cardId];
    if (
      after &&
      after.column != null &&
      (after.zone === 'FRONT' || after.zone === 'RESERVE')
    ) {
      return { column: after.column, ownerId: after.ownerId, zone: after.zone };
    }
    const snap = snapshot.get(cardId);
    if (
      snap &&
      snap.column != null &&
      (snap.zone === 'FRONT' || snap.zone === 'RESERVE')
    ) {
      return snap;
    }
    return null;
  };

  for (const e of frame.events) {
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
        if (key) {
          adds.push({ id: counter++, position: key, text: '✨', color: '#c0a0ff' });
        }
      }
    } else if (e.type === 'NEUTRAL_CAPTURED') {
      adds.push({
        id: counter++,
        position: `${e.column}:neutral:FRONT`,
        text: '🚩',
        color: e.playerId === 'p1' ? '#8ec5ff' : '#ff9b9b',
      });
    }
  }
  return adds;
}

function ReplayView({ match, onBack }: { match: MatchDetailDto; onBack: () => void }) {
  const frames = useMemo(() => buildFrames(match), [match]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    if (!playing) return;
    if (index >= frames.length - 1) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setIndex((i) => i + 1), 700 / speed);
    return () => clearTimeout(t);
  }, [playing, index, frames.length, speed]);

  const frame = frames[index];
  const state = frame.state;
  
  const winnerName = state.winner
    ? state.winner === 'p1'
      ? match.player1Name
      : match.player2Name
    : null;
  
  const winnerReasonText =
    state.winnerReason === 'glory_zero'
      ? 'по Величию'
      : state.winnerReason === 'alt_victory'
        ? 'по нейтралам'
        : state.winnerReason === 'concede'
          ? 'соперник сдался'
          : state.winnerReason ?? '';

  const log = useMemo<LogEntry[]>(() => {
    resetLogIdCounter();
    const entries: LogEntry[] = [
      {
        id: 0,
        kind: 'turn',
        text: `Реплей матча · ${match.player1Name} vs ${match.player2Name}`,
      },
    ];
    for (let i = 0; i <= index; i++) {
      for (const e of frames[i].events) {
        const entry = makeLogEntry(frames[i].state, e);
        if (entry) entries.push(entry);
      }
    }
    return entries;
  }, [frames, index, match]);

  const [recentFloatings, setRecentFloatings] = useState<Floating[]>([]);
  const prevIndexRef = useRef<number>(index);
  
  useEffect(() => {
    const prev = prevIndexRef.current;

    if (index > prev && index > 0) {
      const frame = frames[index];
      const prevState = frames[index - 1]?.state ?? null;
      const adds = buildFloatingsFromFrame(prevState, frame);
      if (adds.length > 0) {
        setRecentFloatings(adds);
        const ids = new Set(adds.map((a) => a.id));
        const timer = setTimeout(() => {
          setRecentFloatings((cur) => cur.filter((a) => !ids.has(a.id)));
        }, 1300);
        prevIndexRef.current = index;
        return () => clearTimeout(timer);
      }
    }

    if (index < prev) {
      setRecentFloatings([]);
    }

    prevIndexRef.current = index;
  }, [index, frames]);

  const floatingsByPos = useMemo(() => {
    const m = new Map<string, Floating[]>();
    for (const f of recentFloatings) {
      if (!m.has(f.position)) m.set(f.position, []);
      m.get(f.position)!.push(f);
    }
    return m;
  }, [recentFloatings]);

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-title">
          <h1>Реплей</h1>
          <span className="replay-title-names">
            {match.player1Name} vs {match.player2Name}
          </span>
        </div>
        <div className="app-header-actions">
          <button className="btn-header" onClick={onBack}>
            ← К истории
          </button>
        </div>
      </header>
	  {state.winner && (
        <div className="replay-winner-banner">
          <span className="replay-winner-icon">🏆</span>
          <span className="replay-winner-text">
            <b>{winnerName}</b> победил{winnerReasonText ? ` · ${winnerReasonText}` : ''}
          </span>
        </div>
      )}

      <div className="app-body">
        <div className="app-left">
          <PlayerPanel
            state={state}
            playerId="p1"
            isActive={state.activePlayer === 'p1'}
            isBot={!!match.p1BotName}
          />
          <Board
            state={state}
            onSlotClick={() => {}}
            onNeutralClick={() => {}}
            highlightTargets={new Set()}
            highlightSources={new Set()}
            playMode={false}
            attackMode={false}
            attackerColumn={null}
            floatingsByPos={floatingsByPos}
          />
          <PlayerPanel
            state={state}
            playerId="p2"
            isActive={state.activePlayer === 'p2'}
            isBot={!!match.p2BotName}
          />
          <Hand
            state={state}
            playerId={state.activePlayer}
            onPlay={() => {}}
            onReplace={() => {}}
            selectedCardId={null}
            disabled={true}
          />
        </div>
        <div className="app-right">
          <Log entries={log} />
        </div>
      </div>

      <div className="replay-controls">
        <button
          className="replay-btn"
          onClick={() => {
            setPlaying(false);
            setIndex(0);
          }}
          title="В начало"
        >
          ⏮
        </button>
        <button
          className="replay-btn"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          title="Шаг назад"
        >
          ◀
        </button>
        <button
          className="replay-btn replay-btn-primary"
          onClick={() => setPlaying((p) => !p)}
          title={playing ? 'Пауза' : 'Играть'}
        >
          {playing ? '⏸' : '▶'}
        </button>
        <button
          className="replay-btn"
          onClick={() => setIndex((i) => Math.min(frames.length - 1, i + 1))}
          title="Шаг вперёд"
        >
          ▶
        </button>
        <button
          className="replay-btn"
          onClick={() => {
            setPlaying(false);
            setIndex(frames.length - 1);
          }}
          title="В конец"
        >
          ⏭
        </button>

        <div className="replay-progress">
          <input
            type="range"
            min={0}
            max={frames.length - 1}
            value={index}
            onChange={(e) => {
              setPlaying(false);
              setIndex(parseInt(e.target.value, 10));
            }}
            className="replay-slider"
          />
          <span className="replay-counter">
            {index} / {frames.length - 1}
          </span>
        </div>

        <div className="replay-speed">
          {[1, 2, 4].map((s) => (
            <button
              key={s}
              className={`replay-btn ${speed === s ? 'replay-btn-active' : ''}`}
              onClick={() => setSpeed(s)}
              title={`Скорость ×${s}`}
            >
              ×{s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}