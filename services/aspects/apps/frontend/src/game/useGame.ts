import { useCallback, useMemo, useEffect, useRef, useState } from 'react';
import {
  createGame,
  applyCommand,
  allCardIds,
  type GameState,
  type Command,
  type CardInstanceId,
  type PlayerId,
} from '@aspects/engine';
import { getDecks, getPack, type DeckPreset } from '@aspects/cards';
import { makeBot, type Bot } from '@aspects/bot';
import type { CommandRecord, SaveMatchDto } from '@aspects/shared';
import { makeLogEntry, resetLogIdCounter, type LogEntry } from './logEntry';
import { positionKey, guildKey, type Floating } from './floatings';

export interface ResetParams {
  seed: string;
  packId: string;
  deckP1Id: string;
  deckP2Id: string;
  deckP1Cards: string[] | null;
  deckP2Cards: string[] | null;
  p1BotName: string | null;
  p2BotName: string | null;
  observe: boolean;
}

export interface UseGameResult {
  state: GameState;
  log: LogEntry[];
  floatings: Floating[];
  decks: DeckPreset[];
  gameId: number;
  botThinking: PlayerId | null;
  p1IsBot: boolean;
  p2IsBot: boolean;
  observe: boolean;
  paused: boolean;
  speed: number;
  dispatch: (cmd: Command) => void;
  reset: (params: ResetParams) => void;
  setPaused: (v: boolean) => void;
  setSpeed: (v: number) => void;
  getMatchPayload: (names: { p1: string; p2: string }) => SaveMatchDto;
}

interface PositionSnapshot {
  column: number | null;
  ownerId: PlayerId;
  zone: 'FRONT' | 'RESERVE' | 'HAND' | 'DECK' | 'DISCARD';
}

function pickDeck(packId: string, deckId: string): DeckPreset {
  const decks = getDecks(packId);
  if (decks.length === 0) throw new Error(`Pack ${packId} has no decks`);
  return decks.find((d) => d.id === deckId) ?? decks[0];
}

function resolveDeckCards(
  packId: string,
  deckId: string,
  explicitCards: string[] | null,
): string[] {
  if (explicitCards && explicitCards.length > 0) return explicitCards;
  const d = pickDeck(packId, deckId);
  return d.cards;
}

function makeBots(params: {
  p1BotName: string | null;
  p2BotName: string | null;
}): { p1: Bot | null; p2: Bot | null } {
  return {
    p1: params.p1BotName ? makeBot(params.p1BotName) : null,
    p2: params.p2BotName ? makeBot(params.p2BotName) : null,
  };
}

const BASE_BOT_DELAY_MS = 600;
const OBSERVE_BOT_DELAY_MS = 1200;

export function useGame(initial: ResetParams): UseGameResult {
  // ─── Состояние React ───

  const [state, setState] = useState<GameState>(() => {
    const pack = getPack(initial.packId);
    const p1Cards = resolveDeckCards(initial.packId, initial.deckP1Id, initial.deckP1Cards);
    const p2Cards = resolveDeckCards(initial.packId, initial.deckP2Id, initial.deckP2Cards);
    return createGame({
      seed: initial.seed,
      decks: { p1: p1Cards, p2: p2Cards },
      cardDefinitions: pack.cardsById,
      useMulligan: true,
    }).state;
  });

  const [log, setLog] = useState<LogEntry[]>([]);
  const [floatings, setFloatings] = useState<Floating[]>([]);
  const [decks, setDecks] = useState<DeckPreset[]>(() => getDecks(initial.packId));
  const [gameId, setGameId] = useState(0);
  const [bots, setBots] = useState(() => makeBots(initial));
  const [botThinking, setBotThinking] = useState<PlayerId | null>(null);
  const [observe, setObserve] = useState(initial.observe);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);

  // ─── Ref'ы для записи матча ───
  // ВАЖНО: все ref объявлены ДО любых useCallback,
  // которые к ним обращаются. Иначе — TDZ.

  const commandsRef = useRef<CommandRecord[]>([]);
  const startTimeRef = useRef<number>(Date.now());
  const initialDecksRef = useRef<{ p1: string[]; p2: string[] }>({ p1: [], p2: [] });
  const resetParamsRef = useRef<ResetParams>(initial);

  const p1IsBot = bots.p1 !== null;
  const p2IsBot = bots.p2 !== null;

  // ─── applyWithLogAndFloating ───

  const applyWithLogAndFloating = useCallback(
    (prevState: GameState, cmd: Command) => {
      // Запись команды в историю матча.
      const pid: PlayerId =
        'playerId' in cmd
          ? (cmd as { playerId: PlayerId }).playerId
          : 'p1';
      commandsRef.current.push({
        sequence: commandsRef.current.length,
        playerId: pid,
        command: cmd,
      });

      const snapshot = new Map<CardInstanceId, PositionSnapshot>();
      for (const id of allCardIds(prevState)) {
        const c = prevState.cards[id];
        snapshot.set(id, { column: c.column, ownerId: c.ownerId, zone: c.zone });
      }

      const r = applyCommand(prevState, cmd);
      setState(r.state);

      if (r.events.length > 0) {
        const lines = r.events
          .map((e) => makeLogEntry(r.state, e))
          .filter((x): x is LogEntry => !!x);
        if (lines.length > 0) {
          setLog((l) => [...l, ...lines].slice(-300));
        }
      }

      const adds: Floating[] = [];
      let counter = Date.now();

      const resolvePos = (cardId: CardInstanceId): PositionSnapshot | null => {
        const after = r.state.cards[cardId];
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

      for (const e of r.events) {
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

  const dispatch = useCallback(
    (cmd: Command) => {
      applyWithLogAndFloating(state, cmd);
    },
    [state, applyWithLogAndFloating],
  );

  // ─── Бот ───

  const botToAct: PlayerId | null = useMemo(() => {
    if (paused) return null;
    if (state.winner) return null;

    if (state.phase === 'MULLIGAN') {
      const picker: PlayerId = !state.mulliganDone.p1 ? 'p1' : 'p2';
      const bot = picker === 'p1' ? bots.p1 : bots.p2;
      if (bot && !state.mulliganDone[picker]) return picker;
      return null;
    }

    if (state.pendingChoice) {
      const pid = state.pendingChoice.playerId;
      const bot = pid === 'p1' ? bots.p1 : bots.p2;
      return bot ? pid : null;
    }

    const pid = state.activePlayer;
    const bot = pid === 'p1' ? bots.p1 : bots.p2;
    return bot ? pid : null;
  }, [state, paused, bots]);

  useEffect(() => {
    if (!botToAct) {
      setBotThinking(null);
      return;
    }

    const pid = botToAct;
    setBotThinking(pid);

    const baseDelay = observe ? OBSERVE_BOT_DELAY_MS : BASE_BOT_DELAY_MS;
    const delay = Math.max(50, baseDelay / speed);

    const t = setTimeout(() => {
      const bot = pid === 'p1' ? bots.p1 : bots.p2;
      let cmd: Command | null = bot ? bot.chooseCommand(state, pid) : null;

      if (!cmd) {
        console.warn('[bot] null command', {
          pid,
          phase: state.phase,
          pendingChoice: state.pendingChoice?.kind ?? null,
        });
        if (state.pendingChoice) {
          const choice = state.pendingChoice;
          const cardIds =
            choice.kind === 'EFFECT_TARGET_SELECTION'
              ? []
              : choice.eligibleCardIds.slice(0, choice.count);
          cmd = { type: 'RESOLVE_CHOICE', playerId: choice.playerId, cardIds };
        } else if (state.phase === 'PLAY' || state.phase === 'COMBAT') {
          cmd = { type: 'END_TURN', playerId: pid };
        } else if (state.phase === 'MULLIGAN') {
          cmd = { type: 'MULLIGAN', playerId: pid, cardId: null };
        } else {
          cmd = { type: 'ADVANCE_PHASE', playerId: pid };
        }
      }

      setBotThinking(null);
      applyWithLogAndFloating(state, cmd);
    }, delay);

    return () => {
      clearTimeout(t);
      setBotThinking(null);
    };
  }, [botToAct, state, applyWithLogAndFloating, observe, speed, bots]);

  // ─── Reset ───

  const reset = useCallback((params: ResetParams) => {
    const pack = getPack(params.packId);
    const p1Cards = resolveDeckCards(params.packId, params.deckP1Id, params.deckP1Cards);
    const p2Cards = resolveDeckCards(params.packId, params.deckP2Id, params.deckP2Cards);

    // Обновляем ref'ы ДО setState.
    commandsRef.current = [];
    startTimeRef.current = Date.now();
    resetParamsRef.current = params;
    initialDecksRef.current = { p1: p1Cards, p2: p2Cards };

    const r = createGame({
      seed: params.seed,
      decks: { p1: p1Cards, p2: p2Cards },
      cardDefinitions: pack.cardsById,
      useMulligan: true,
    });

    setBots(makeBots(params));
    setState(r.state);
    setDecks(getDecks(params.packId));
    setGameId((g) => g + 1);
    setFloatings([]);
    setObserve(params.observe);
    setPaused(false);
    setSpeed(1);
    resetLogIdCounter();

    const labels: string[] = [];
    if (params.p1BotName) labels.push(`P1 — ${params.p1BotName}`);
    if (params.p2BotName) labels.push(`P2 — ${params.p2BotName}`);

    setLog([
      {
        id: 0,
        kind: 'turn',
        text:
          `Пак: ${pack.meta.name} · seed: ${params.seed.slice(-8)}` +
          (labels.length > 0 ? ' · ' + labels.join(' · ') : ''),
      },
      ...r.events
        .map((e) => makeLogEntry(r.state, e))
        .filter((x): x is LogEntry => !!x),
    ]);
  }, []);

  // ─── Payload для сохранения матча ───

  const getMatchPayload = useCallback(
    (names: { p1: string; p2: string }): SaveMatchDto => {
      const params = resetParamsRef.current;
      return {
        packId: params.packId,
        seed: params.seed,
        player1Name: names.p1,
        player2Name: names.p2,
        winnerId: state.winner,
        winnerReason: state.winnerReason,
        turnNumber: state.turnNumber,
        durationMs: Date.now() - startTimeRef.current,
        p1BotName: params.p1BotName,
        p2BotName: params.p2BotName,
        deckP1: initialDecksRef.current.p1,
        deckP2: initialDecksRef.current.p2,
        commands: [...commandsRef.current],
      };
    },
    [state.winner, state.winnerReason, state.turnNumber],
  );

  return {
    state,
    log,
    floatings,
    decks,
    gameId,
    botThinking,
    p1IsBot,
    p2IsBot,
    observe,
    paused,
    speed,
    dispatch,
    reset,
    setPaused,
    setSpeed,
    getMatchPayload,
  };
}