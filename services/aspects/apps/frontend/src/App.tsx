import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { useGame, type ResetParams } from './game/useGame';
import { listPacks, getDecks, seriesOfDeck, mergedCardsById } from '@aspects/cards';
import { Board } from './components/Board';
import { Hand } from './components/Hand';
import { PlayerPanel } from './components/PlayerPanel';
import { PhaseControls } from './components/PhaseControls';
import { Log } from './components/Log';
import { ChoicePrompt } from './components/ChoicePrompt';
import { ActionMenu, type ActionOption } from './components/ActionMenu';
import { VictoryModal } from './components/VictoryModal';
import { PassOverlay } from './components/PassOverlay';
import { MulliganScreen } from './components/MulliganScreen';
import { SetupScreen, type StartParams } from './components/SetupScreen';
import { ObserveControls } from './components/ObserveControls';
import { DecksScreen } from './components/DecksScreen';
import { DeckEditorScreen } from './components/DeckEditorScreen';
import { useAuth } from './game/useAuth';
import { useDecks } from './game/useDecks';
import type { CardInstanceId, ColumnIndex, GameState, PlayerId } from '@aspects/engine';
import { opponentOf, frontCount } from '@aspects/engine';
import type { Floating } from './game/floatings';
import { useMatches } from './game/useMatches';
import { matchesApi } from './game/matchesApi';
import { MatchesScreen } from './components/MatchesScreen';
import { ReplayScreen } from './components/ReplayScreen';
import { OnlineLobbyScreen } from './components/OnlineLobbyScreen';
import { OnlineGameScreen } from './components/OnlineGameScreen';
import { ProfileScreen } from './components/ProfileScreen';
import { MatchmakingScreen } from './components/MatchmakingScreen';
import { UsersSearchScreen } from './components/UsersSearchScreen';
import { LeaderboardScreen } from './components/LeaderboardScreen';
import { UserProfileScreen } from './components/UserProfileScreen';
import { FriendsScreen } from './components/FriendsScreen';
import { FriendToasts } from './game/friendToasts';
import { RoomInviteToasts } from './game/roomInviteToasts';
import { useScreenRouting } from './game/useScreenRouting';

type ActionMode =
  | { kind: 'idle' }
  | { kind: 'play'; cardId: CardInstanceId }
  | { kind: 'attack'; attackerId: CardInstanceId }
  | { kind: 'replace'; handCardId: CardInstanceId; targetCardId: CardInstanceId };

interface CardMenuState {
  cardId: CardInstanceId;
}

export type Screen =
  | { kind: 'profile' }
  | { kind: 'setup' }
  | { kind: 'playing' }
  | { kind: 'decks' }
  | { kind: 'deck-editor'; deckId: string | null }
  | { kind: 'history' }
  | { kind: 'replay'; matchId: string }
  | { kind: 'online-lobby'; joinCode?: string }
  | { kind: 'online-game'; roomCode: string; role: 'player' | 'spectator' }
  | { kind: 'matchmaking' }
  | { kind: 'users-search' }
  | { kind: 'leaderboard' }
  | { kind: 'user-profile'; userId: string }
  | { kind: 'friends' };

function findMatchingPersonalityOnBoard(
  state: GameState,
  playerId: 'p1' | 'p2',
  personalityTag: string,
): CardInstanceId | null {
  for (const col of state.board) {
    const ids =
      playerId === 'p1'
        ? [col.p1Front, col.p1Reserve]
        : [col.p2Front, col.p2Reserve];
    for (const id of ids) {
      if (!id) continue;
      const card = state.cards[id];
      const def = state.definitions[card.definitionId];
      if (def?.personalityTag === personalityTag) return id;
    }
  }
  return null;
}

function defaultResetParams(): ResetParams {
  const decks = getDecks();
  const p1Cards = decks[0]?.cards ?? [];
  const p2Cards = decks[1]?.cards ?? decks[0]?.cards ?? [];
  const p1Series = seriesOfDeck(p1Cards);
  const p2Series = seriesOfDeck(p2Cards);
  return {
    seed: `game-${Date.now()}`,
    series: [...new Set([...p1Series, ...p2Series])],
    deckP1Id: decks[0]?.id ?? '',
    deckP2Id: decks[1]?.id ?? decks[0]?.id ?? '',
    deckP1Cards: null,
    deckP2Cards: null,
    p1BotName: null,
    p2BotName: null,
    observe: false,
  };
}

export default function App() {
  const auth = useAuth();
  const [screen, setScreen] = useScreenRouting();

  const navigateByInvite = useCallback(
    (roomCode: string) => {
      setScreen({ kind: 'online-lobby', joinCode: roomCode });
    },
    [],
  );

  return (
    <>
      <FriendToasts auth={auth} />
      <RoomInviteToasts auth={auth} onAccept={navigateByInvite} />
      <AppMain auth={auth} screen={screen} setScreen={setScreen} />
    </>
  );
}

function AppMain({
  auth,
  screen,
  setScreen,
}: {
  auth: ReturnType<typeof useAuth>;
  screen: Screen;
  setScreen: (s: Screen) => void;
}) {
  const deckStore = useDecks(auth);
  const matchStore = useMatches(auth);

  const [resetParams, setResetParams] = useState<ResetParams>(() =>
    defaultResetParams(),
  );

  const {
    state, log, floatings, decks, gameId, botThinking,
    p1IsBot, p2IsBot, observe, paused, speed,
    dispatch, reset, setPaused, setSpeed,
	getMatchPayload,
  } = useGame(resetParams);

  const [mode, setMode] = useState<ActionMode>({ kind: 'idle' });
  const [cardMenu, setCardMenu] = useState<CardMenuState | null>(null);
  const [passOverlay, setPassOverlay] = useState(false);

  const activePlayer = state.activePlayer;
  const opponent = opponentOf(activePlayer);
  const activePlayerIsHuman = !(activePlayer === 'p1' ? p1IsBot : p2IsBot);

  const prevActiveRef = useRef(state.activePlayer);
  const prevGameIdRef = useRef(gameId);

  useEffect(() => {
    if (prevGameIdRef.current !== gameId) {
      prevGameIdRef.current = gameId;
      prevActiveRef.current = state.activePlayer;
      setPassOverlay(false);
      return;
    }
    const newPid = state.activePlayer;
    const newIsBot = newPid === 'p1' ? p1IsBot : p2IsBot;
    if (newIsBot) {
      prevActiveRef.current = newPid;
      setPassOverlay(false);
      return;
    }
    if (prevActiveRef.current !== state.activePlayer) {
      setPassOverlay(true);
      prevActiveRef.current = state.activePlayer;
    }
  }, [state.activePlayer, gameId, p1IsBot, p2IsBot]);

  useEffect(() => {
    if (state.winner) setPassOverlay(false);
  }, [state.winner]);
  
  const savedMatchRef = useRef<string | null>(null);

  useEffect(() => {
    if (!state.winner) return;
    if (auth.kind !== 'authenticated') return;
    if (savedMatchRef.current === gameId + ':' + state.turnNumber) return;

    const player1Name = p1IsBot
      ? resetParams.p1BotName ?? 'Бот'
      : auth.user.username;
    const player2Name = p2IsBot
      ? resetParams.p2BotName ?? 'Бот'
      : auth.user.username;

    const payload = getMatchPayload({ p1: player1Name, p2: player2Name });
    savedMatchRef.current = gameId + ':' + state.turnNumber;

    matchesApi
      .save(payload)
      .then(() => matchStore.reload())
      .catch((e: unknown) => console.warn('[matches] save failed', e));
  }, [
    state.winner,
    state.turnNumber,
    auth,
    p1IsBot,
    p2IsBot,
    resetParams,
    gameId,
    getMatchPayload,
    matchStore,
  ]);

  const floatingsByPos = useMemo(() => {
    const m = new Map<string, Floating[]>();
    for (const f of floatings) {
      if (!m.has(f.position)) m.set(f.position, []);
      m.get(f.position)!.push(f);
    }
    return m;
  }, [floatings]);

  const highlightSources = useMemo(() => {
    if (mode.kind === 'attack') return new Set([mode.attackerId]);
    if (mode.kind === 'replace') return new Set([mode.targetCardId]);
    return new Set<CardInstanceId>();
  }, [mode]);

  const highlightTargets = useMemo(() => {
    if (mode.kind !== 'attack') return new Set<CardInstanceId>();
    const targets = new Set<CardInstanceId>();
    const attacker = state.cards[mode.attackerId];
    if (!attacker) return targets;
    const attackerCol = attacker.column;
    const hasScout = state.definitions[attacker.definitionId].abilities.includes('scout');
    let tauntId: CardInstanceId | null = null;
    if (attackerCol && !hasScout) {
      const col = state.board[attackerCol - 1];
      const f = opponent === 'p1' ? col.p1Front : col.p2Front;
      if (f) {
        const def = state.definitions[state.cards[f].definitionId];
        if (def.abilities.includes('taunt')) tauntId = f;
      }
    }
    for (const col of state.board) {
      const f = opponent === 'p1' ? col.p1Front : col.p2Front;
      const r = opponent === 'p1' ? col.p1Reserve : col.p2Reserve;
      if (tauntId) {
        if (f === tauntId) targets.add(f);
        if (hasScout && r) targets.add(r);
        continue;
      }
      if (f) {
        targets.add(f);
        if (hasScout && r) targets.add(r);
      } else if (r) {
        targets.add(r);
      }
    }
    return targets;
  }, [mode, state, opponent]);

  const attackerColumn: ColumnIndex | null = useMemo(() => {
    if (mode.kind !== 'attack') return null;
    const card = state.cards[mode.attackerId];
    return (card?.column as ColumnIndex) ?? null;
  }, [mode, state]);

  const resetMode = useCallback(() => setMode({ kind: 'idle' }), []);

  const handlePlay = (cardId: CardInstanceId) => setMode({ kind: 'play', cardId });
  const handleReplace = (cardId: CardInstanceId) => {
    const card = state.cards[cardId];
    const def = state.definitions[card.definitionId];
    const targetId = findMatchingPersonalityOnBoard(state, activePlayer, def.personalityTag);
    if (!targetId) return;
    setMode({ kind: 'replace', handCardId: cardId, targetCardId: targetId });
  };

  const handleSlotClick = (
    column: number,
    owner: 'p1' | 'p2',
    zone: 'FRONT' | 'RESERVE',
    cardId: CardInstanceId | null,
  ) => {
    if (!activePlayerIsHuman) return;

    if (mode.kind === 'replace') {
      if (cardId === mode.targetCardId) {
        dispatch({ type: 'REPLACE_CARD', playerId: activePlayer, cardId: mode.handCardId });
        setMode({ kind: 'idle' });
      }
      return;
    }
    if (mode.kind === 'play') {
      if (owner !== activePlayer) return;
      if (zone !== 'RESERVE') return;
      if (cardId !== null) return;
      dispatch({
        type: 'PLAY_CARD',
        playerId: activePlayer,
        cardId: mode.cardId,
        column: column as ColumnIndex,
      });
      setMode({ kind: 'idle' });
      return;
    }
    if (mode.kind === 'attack') {
      if (owner === activePlayer) return;
      if (!cardId) return;
      if (!highlightTargets.has(cardId)) return;
      dispatch({
        type: 'ATTACK',
        playerId: activePlayer,
        attackerId: mode.attackerId,
        target: { kind: 'CARD', cardId },
      });
      setMode({ kind: 'idle' });
      return;
    }
    if (!cardId) return;
    if (owner !== activePlayer) return;
    if (zone !== 'FRONT') return;

    const card = state.cards[cardId];
    const def = state.definitions[card.definitionId];
    const canAttack = !card.exhausted && state.phase === 'COMBAT';
    const abilities = def.activatedAbilities ?? [];
    const availableAbilities = abilities
      .map((_, idx) => idx)
      .filter((idx) => !card.usedAbilitiesThisTurn.includes(idx));
    const inActionPhase = state.phase === 'PLAY' || state.phase === 'COMBAT';
    const hasAbility = availableAbilities.length > 0 && inActionPhase;

    if (canAttack && !hasAbility) {
      setMode({ kind: 'attack', attackerId: cardId });
      return;
    }
    if (!canAttack && availableAbilities.length === 1) {
      dispatch({
        type: 'USE_ABILITY',
        playerId: activePlayer,
        cardId,
        abilityIndex: availableAbilities[0],
      });
      return;
    }
    setCardMenu({ cardId });
  };

  const handleNeutralClick = (column: ColumnIndex) => {
    if (!activePlayerIsHuman) return;
    if (mode.kind !== 'attack') return;
    dispatch({
      type: 'ATTACK',
      playerId: activePlayer,
      attackerId: mode.attackerId,
      target: { kind: 'NEUTRAL', column },
    });
    setMode({ kind: 'idle' });
  };

  const handleGuildAttack = () => {
    if (!activePlayerIsHuman) return;
    if (mode.kind !== 'attack') return;
    dispatch({
      type: 'ATTACK',
      playerId: activePlayer,
      attackerId: mode.attackerId,
      target: { kind: 'GUILD', playerId: opponent },
    });
    setMode({ kind: 'idle' });
  };

  const handleNext = () => {
    setMode({ kind: 'idle' });
    setCardMenu(null);
    dispatch({ type: 'ADVANCE_PHASE', playerId: activePlayer });
  };
  const handleEndTurn = () => {
    setMode({ kind: 'idle' });
    setCardMenu(null);
    dispatch({ type: 'END_TURN', playerId: activePlayer });
  };
  const handleChoice = (cardIds: CardInstanceId[]) => {
    if (!state.pendingChoice) return;
    dispatch({
      type: 'RESOLVE_CHOICE',
      playerId: state.pendingChoice.playerId,
      cardIds,
    });
  };

  const startNewGame = (opts: Partial<ResetParams> = {}) => {
    const merged: ResetParams = { ...resetParams, ...opts, seed: `game-${Date.now()}` };
    setResetParams(merged);
    reset(merged);
    setMode({ kind: 'idle' });
    setCardMenu(null);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
      if (state.winner || state.pendingChoice) return;
      if (!activePlayerIsHuman) return;
      if (screen.kind !== 'playing') return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (state.phase === 'COMBAT') {
          dispatch({ type: 'END_TURN', playerId: activePlayer });
        } else {
          dispatch({ type: 'ADVANCE_PHASE', playerId: activePlayer });
        }
      } else if (e.code === 'Enter' && state.phase === 'PLAY') {
        e.preventDefault();
        dispatch({ type: 'END_TURN', playerId: activePlayer });
      } else if (e.code === 'Escape') {
        setMode({ kind: 'idle' });
        setCardMenu(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [state, activePlayer, dispatch, activePlayerIsHuman, screen.kind]);

  const opponentFrontEmpty = frontCount(state, opponent) === 0;

  let cardMenuOptions: ActionOption[] = [];
  let cardMenuTitle = '';
  let cardMenuSubtitle = '';
  if (cardMenu) {
    const card = state.cards[cardMenu.cardId];
    const def = state.definitions[card.definitionId];
    cardMenuTitle = def.name;
    const canAttack = !card.exhausted && state.phase === 'COMBAT';
    const abilities = def.activatedAbilities ?? [];
    cardMenuSubtitle =
      `⚔ ${card.baseStrength} · ❤ ${card.baseHealth - card.damageTaken}` +
      (card.exhausted ? ' · истощён' : '');

    if (canAttack) {
      cardMenuOptions.push({
        label: '⚔ Атаковать',
        onSelect: () => setMode({ kind: 'attack', attackerId: cardMenu.cardId }),
      });
    }
    if (abilities.length > 0 && (state.phase === 'PLAY' || state.phase === 'COMBAT')) {
      abilities.forEach((a: any, idx: number) => {
        const used = card.usedAbilitiesThisTurn.includes(idx);
        if (!used) {
          cardMenuOptions.push({
            label: `⚡ ${a.id} (${a.cost}💰)`,
            onSelect: () =>
              dispatch({
                type: 'USE_ABILITY',
                playerId: activePlayer,
                cardId: cardMenu.cardId,
                abilityIndex: idx,
              }),
          });
        }
      });
    }
    if (cardMenuOptions.length === 0) {
      cardMenuOptions.push({ label: 'Нет доступных действий', onSelect: () => {} });
    }
  }
  
  if (screen.kind === 'friends') {
    return (
      <FriendsScreen
        auth={auth}
        onBack={() => setScreen({ kind: 'profile' })}
      />
    );
  }
  if (screen.kind === 'profile') {
    return (
      <ProfileScreen
        auth={auth}
        savedDecks={deckStore.decks}
        matches={matchStore.matches}
        matchesLoading={matchStore.loading}
        onNavigate={(target) => {
          if (target === 'setup') setScreen({ kind: 'setup' });
          else if (target === 'online') setScreen({ kind: 'online-lobby' });
          else if (target === 'decks') setScreen({ kind: 'decks' });
          else if (target === 'history') setScreen({ kind: 'history' });
		  else if (target === 'users-search') setScreen({ kind: 'users-search' });
		  else if (target === 'leaderboard') setScreen({ kind: 'leaderboard' });
		  else if (target === 'friends') setScreen({ kind: 'friends' });
        }}
      />
    );
  }
  
  if (screen.kind === 'users-search') {
    return (
      <UsersSearchScreen
        onBack={() => setScreen({ kind: 'profile' })}
        onOpenProfile={(userId) => setScreen({ kind: 'user-profile', userId })}
      />
    );
  }
  
  if (screen.kind === 'leaderboard') {
    return (
      <LeaderboardScreen
        onBack={() => setScreen({ kind: 'profile' })}
        onOpenProfile={(userId) => setScreen({ kind: 'user-profile', userId })}
      />
    );
  }
  
  if (screen.kind === 'user-profile') {
    return (
      <UserProfileScreen
        userId={screen.userId}
        onBack={() => setScreen({ kind: 'profile' })}
      />
    );
  }

  if (screen.kind === 'setup') {
    return (
      <SetupScreen
        initial={resetParams}
        auth={auth}
        savedDecks={deckStore.decks}
        onBack={() => setScreen({ kind: 'profile' })}
        onStart={(params: StartParams) => {
          const merged: ResetParams = {
            seed: `game-${Date.now()}`,
            series: params.series,
            deckP1Id: params.deckP1Id,
            deckP2Id: params.deckP2Id,
            deckP1Cards: params.deckP1Cards,
            deckP2Cards: params.deckP2Cards,
            p1BotName: params.p1BotName,
            p2BotName: params.p2BotName,
            observe: params.observe,
          };
          setResetParams(merged);
          reset(merged);
          setScreen({ kind: 'playing' });
        }}
      />
    );
  }

  if (screen.kind === 'decks') {
    return (
      <DecksScreen
        auth={auth}
        deckStore={deckStore}
        onBack={() => setScreen({ kind: 'profile' })}
        onEdit={(deckId) => setScreen({ kind: 'deck-editor', deckId })}
        onNew={() => setScreen({ kind: 'deck-editor', deckId: null })}
      />
    );
  }

  if (screen.kind === 'deck-editor') {
    return (
      <DeckEditorScreen
        deckId={screen.deckId}
        deckStore={deckStore}
        onBack={() => setScreen({ kind: 'decks' })}
      />
    );
  }

  if (screen.kind === 'history') {
    return (
      <MatchesScreen
        auth={auth}
        matches={matchStore.matches}
        loading={matchStore.loading}
        error={matchStore.error}
        onBack={() => setScreen({ kind: 'profile' })}
        onOpenReplay={(matchId: string) => setScreen({ kind: 'replay', matchId })}
        onReload={matchStore.reload}
      />
    );
  }

  if (screen.kind === 'replay') {
    return (
      <ReplayScreen
        matchId={screen.matchId}
        onBack={() => setScreen({ kind: 'history' })}
      />
    );
  }
  
  if (screen.kind === 'matchmaking') {
    return (
      <MatchmakingScreen
        auth={auth}
        savedDecks={deckStore.decks}
        onBack={() => setScreen({ kind: 'online-lobby' })}
        onMatched={(roomCode) =>
          setScreen({ kind: 'online-game', roomCode, role: 'player' })
        }
      />
    );
  }
  
  if (screen.kind === 'online-lobby') {
    return (
      <OnlineLobbyScreen
        auth={auth}
		savedDecks={deckStore.decks}
        onBack={() => setScreen({ kind: 'profile' })}
          onJoinRoom={(code) =>
          setScreen({ kind: 'online-game', roomCode: code, role: 'player' })
        }
        onSpectateRoom={(code) =>
          setScreen({ kind: 'online-game', roomCode: code, role: 'spectator' })
        }
		onQuickPlay={() => setScreen({ kind: 'matchmaking' })}
		initialJoinCode={screen.kind === 'online-lobby' ? screen.joinCode : undefined}
      />
    );
  }

  if (screen.kind === 'online-game') {
    return (
      <OnlineGameScreen
        auth={auth}
        roomCode={screen.roomCode}
		role={screen.role}
        onExit={() => setScreen({ kind: 'online-lobby' })}
      />
    );
  }

  if (state.phase === 'MULLIGAN') {
    const picker: PlayerId = !state.mulliganDone.p1 ? 'p1' : 'p2';
    const pickerIsBot = picker === 'p1' ? p1IsBot : p2IsBot;

    if (pickerIsBot) {
      return (
        <div className="mulligan-overlay">
          <div className="mulligan-modal">
            <div className="mulligan-title">
              {picker.toUpperCase()} — бот выбирает стартовую руку…
            </div>
            <div className="mulligan-subtitle">
              {botThinking ? '● ● ●' : 'Готово'}
            </div>
          </div>
        </div>
      );
    }

    return (
      <MulliganScreen
        state={state}
        currentPicker={picker}
        onConfirm={(cardId) => {
          dispatch({ type: 'MULLIGAN', playerId: picker, cardId });
        }}
      />
    );
  }

  const bothBots = p1IsBot && p2IsBot;

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-title">
          <h1>Аспекты</h1>
          <span className={`turn-badge turn-${state.activePlayer}`}>
            Ход: {state.activePlayer.toUpperCase()}
          </span>
          {p1IsBot && <span className="bot-badge">P1 — БОТ</span>}
          {p2IsBot && <span className="bot-badge">P2 — БОТ</span>}
          {bothBots && <span className="bot-badge bot-badge-vs">БОТ vs БОТ</span>}
        </div>
        <div className="app-header-actions">
          {(bothBots || (observe && (p1IsBot || p2IsBot))) && (
            <ObserveControls
              paused={paused}
              speed={speed}
              onTogglePause={() => setPaused(!paused)}
              onChangeSpeed={setSpeed}
            />
          )}
          <button className="btn-header" onClick={() => setScreen({ kind: 'profile' })}>
            ⚙ Настройки
          </button>
		  <button
            className="btn-header"
            onClick={() => setScreen({ kind: 'history' })}
            title='История матчей'
          >
            📜 История {auth.kind !== 'authenticated' && '🔒'}
          </button>
          <button className="btn-header" onClick={() => startNewGame()}>
            🔄 Реванш
          </button>
        </div>
      </header>

      <div className="app-body">
        <div className="app-left">
          <PlayerPanel
            state={state}
            playerId={opponent}
            isActive={false}
            isBot={opponent === 'p1' ? p1IsBot : p2IsBot}
            botThinking={botThinking === opponent}
            observe={observe}
			floatings={floatingsByPos.get(`guild:${opponent}`)}
          />

          <Board
            state={state}
            onSlotClick={handleSlotClick}
            onNeutralClick={handleNeutralClick}
            highlightTargets={highlightTargets}
            highlightSources={highlightSources}
            playMode={mode.kind === 'play'}
            attackMode={mode.kind === 'attack'}
            attackerColumn={attackerColumn}
            floatingsByPos={floatingsByPos}
          />

          {botThinking && !bothBots && (
            <div className="hint bot-thinking">
              <span className="bot-thinking-dots">● ● ●</span>
              {botThinking.toUpperCase()} думает…
            </div>
          )}

          <div className="hint-container">
            {mode.kind === 'play' && (
              <div className="hint hint-with-actions">
                <div>Кликните по пунктирному слоту Резерва (колонка 1–5)</div>
                <button className="hint-cancel" onClick={resetMode}>✕ Отмена</button>
              </div>
            )}
            {mode.kind === 'replace' && (
              <div className="hint hint-with-actions">
                <div>Кликните по подсвеченной карте, чтобы заменить</div>
                <button className="hint-cancel" onClick={resetMode}>✕ Отмена</button>
              </div>
            )}
            {mode.kind === 'attack' && (() => {
              const attacker = state.cards[mode.attackerId];
              const attackerCol = attacker?.column;
              const hasScout = state.definitions[attacker.definitionId].abilities.includes('scout');
              let tauntCardName: string | null = null;
              if (attackerCol && !hasScout) {
                const col = state.board[attackerCol - 1];
                const f = opponent === 'p1' ? col.p1Front : col.p2Front;
                if (f) {
                  const def = state.definitions[state.cards[f].definitionId];
                  if (def.abilities.includes('taunt')) tauntCardName = def.name;
                }
              }
              return (
                <div className="hint hint-with-actions">
                  <div>
                    {tauntCardName
                      ? <>Страж <b>{tauntCardName}</b> блокирует все цели, кроме себя.</>
                      : 'Кликните по подсвеченной цели или нейтралу'}
                  </div>
                  <div className="hint-buttons">
                    {opponentFrontEmpty && (
                      <button className="hint-action" onClick={handleGuildAttack}>
                        ⚔ Атаковать гильдию
                      </button>
                    )}
                    <button className="hint-cancel" onClick={resetMode}>✕ Отмена</button>
                  </div>
                </div>
              );
            })()}
          </div>

          <PlayerPanel
            state={state}
            playerId={activePlayer}
            isActive={true}
            isBot={activePlayer === 'p1' ? p1IsBot : p2IsBot}
            botThinking={botThinking === activePlayer}
            observe={observe}
			floatings={floatingsByPos.get(`guild:${activePlayer}`)}
          />

          <Hand
            state={state}
            playerId={activePlayer}
            onPlay={handlePlay}
            onReplace={handleReplace}
            selectedCardId={mode.kind === 'play' ? mode.cardId : null}
            disabled={!activePlayerIsHuman}
            observe={observe}
          />

          <PhaseControls
            state={state}
            onNext={handleNext}
            onEndTurn={handleEndTurn}
            disabled={!activePlayerIsHuman}
          />
        </div>
        <div className="app-right">
          <Log entries={log} />
        </div>
      </div>

      {cardMenu && (
        <ActionMenu
          title={cardMenuTitle}
          subtitle={cardMenuSubtitle}
          options={cardMenuOptions}
          onCancel={() => setCardMenu(null)}
        />
      )}

      {state.pendingChoice && (() => {
        const pid = state.pendingChoice.playerId;
        const pidIsBot = pid === 'p1' ? p1IsBot : p2IsBot;
        if (pidIsBot) return null;
        return <ChoicePrompt state={state} onSubmit={handleChoice} />;
      })()}

      {passOverlay &&
        !state.winner &&
        !(state.activePlayer === 'p1' ? p1IsBot : p2IsBot) && (
          <PassOverlay
            nextPlayer={state.activePlayer}
            onConfirm={() => setPassOverlay(false)}
          />
        )}

      <VictoryModal
        state={state}
        onNewGame={() => startNewGame()}
        onExit={() => setScreen({ kind: 'profile' })}
      />
    </div>
  );
}