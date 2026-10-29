import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import type { AuthState } from '../game/useAuth';
import { useOnlineGame } from '../game/useOnlineGame';
import type { CardInstanceId, ColumnIndex, PlayerId } from '@aspects/engine';
import { opponentOf, frontCount, columnBonuses } from '@aspects/engine';
import { Board } from './Board';
import { Hand } from './Hand';
import { PlayerPanel } from './PlayerPanel';
import { PhaseControls } from './PhaseControls';
import { Log } from './Log';
import { ChoicePrompt } from './ChoicePrompt';
import { VictoryModal } from './VictoryModal';
import { MulliganScreen } from './MulliganScreen';
import { TurnTimer } from './TurnTimer';
import { RematchDialog } from './RematchDialog';
import { OpponentLeftDialog } from './OpponentLeftDialog';
import { decodeAnonName } from '../game/anonId';
import { botDisplayName } from '@aspects/bot';
import { useOpenProfile } from '../game/profileModal';
import { onlineApi } from '../game/onlineApi';
import { useConfirm } from '../game/confirmContext';
import { ActionMenu, type ActionOption } from './ActionMenu';

interface Props {
  auth: AuthState;
  roomCode: string;
  role?: 'player' | 'spectator';
  onExit: () => void;
}

export function OnlineGameScreen({ auth, roomCode, role = 'player', onExit }: Props) {
  if (auth.kind === 'loading') {
    return (
      <div className="online-status-screen">
        <div className="online-status-text">Загрузка…</div>
      </div>
    );
  }
  const userId =
    auth.kind === 'authenticated' ? auth.user.id : `anon:${auth.anonId}`;
  return (
    <OnlineGameInner
      userId={userId}
      roomCode={roomCode}
      role={role}
      onExit={onExit}
    />
  );
}

function OnlineGameInner({
  userId,
  roomCode,
  role,
  onExit,
}: {
  userId: string;
  roomCode: string;
  role: 'player' | 'spectator';
  onExit: () => void;
}) {
  const online = useOnlineGame({ roomCode, userId, role, onGameOver: () => {} });

  const {
    status,
    state,
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
    myRole,
    dispatch,
    concede,
    proposeRematch,
    respondRematch,
    dismissRematchNotice,
    dismissOpponentLeft,
	ratingUpdate,
  } = online;

  // ─── ВСЕ ХУКИ ВЫШЕ ЛЮБЫХ РАННИХ RETURN ───

  const [selectedCardId, setSelectedCardId] = useState<CardInstanceId | null>(null);
  const [attackMode, setAttackMode] = useState<CardInstanceId | null>(null);
  const [replaceMode, setReplaceMode] = useState<CardInstanceId | null>(null);
  const [cardMenu, setCardMenu] = useState<CardInstanceId | null>(null);

  const replaceIntentRef = useRef<CardInstanceId | null>(null);

  const isSpectator = myRole === 'spectator';
  const mySide: PlayerId | null = myPlayerId;
  
  const openProfile = useOpenProfile();
  
  const confirm = useConfirm();
  
  const opponentIsBot = !!roomInfo?.guestId?.startsWith('anon:bot:');
  
  const [nowTick, setNowTick] = useState(Date.now());
  
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const floatingsByPos = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const f of floatings) {
      if (!m.has(f.position)) m.set(f.position, []);
      m.get(f.position)!.push(f);
    }
    return m;
  }, [floatings]);

  const opponentSide: PlayerId | null = myPlayerId ? opponentOf(myPlayerId) : null;
  
  const replaceCandidates = useMemo(() => {
    if (!state || !replaceMode || !mySide) return [];
    const newCard = state.cards[replaceMode];
    if (!newCard) return [];
    const newDef = state.definitions[newCard.definitionId];
    if (!newDef) return [];
    const colReduction = columnBonuses(state, mySide).costReduction;
    const out: Array<{ cardId: CardInstanceId; cost: number }> = [];
    for (const col of state.board) {
      const ids = mySide === 'p1'
        ? [col.p1Front, col.p1Reserve]
        : [col.p2Front, col.p2Reserve];
      for (const cid of ids) {
        if (!cid) continue;
        const c = state.cards[cid];
        if (!c) continue;
        const cd = state.definitions[c.definitionId];
        if (!cd) continue;
        if (cd.personalityTag !== newDef.personalityTag) continue;
        if (cd.cantBeReplaced) continue;
        const discount = Math.min(
          Math.floor(cd.cost / 2),
          Math.floor(newDef.cost / 2),
        );
        const cost = Math.max(0, newDef.cost - discount - colReduction);
        out.push({ cardId: cid, cost });
      }
    }
    return out;
  }, [state, replaceMode, mySide]);
  
  const replaceCosts = useMemo(() => {
    const m = new Map<CardInstanceId, number>();
    for (const c of replaceCandidates) m.set(c.cardId, c.cost);
    return m;
  }, [replaceCandidates]);
  
  const highlightSources = useMemo(() => {
    const s = new Set<CardInstanceId>();
    if (attackMode) s.add(attackMode);
    if (replaceMode) {
      for (const c of replaceCandidates) s.add(c.cardId);
    }
    return s;
  }, [attackMode, replaceMode, replaceCandidates]);

  const highlightTargets = useMemo(() => {
    const targets = new Set<CardInstanceId>();
    try {
      if (!state || !attackMode || !opponentSide) return targets;
      const attacker = state.cards[attackMode];
      if (!attacker) return targets;
      const attackerCol = attacker.column;
      const attackerDef = state.definitions?.[attacker.definitionId];
      const hasScout = attackerDef?.abilities?.includes('scout') ?? false;

      let tauntId: CardInstanceId | null = null;
      if (attackerCol && !hasScout) {
        const col = state.board?.[attackerCol - 1];
        if (col) {
          const f = opponentSide === 'p1' ? col.p1Front : col.p2Front;
          if (f) {
            const def = state.definitions?.[state.cards[f].definitionId];
            if (def?.abilities?.includes('taunt')) tauntId = f;
          }
        }
      }

      for (const col of state.board ?? []) {
        const f = opponentSide === 'p1' ? col.p1Front : col.p2Front;
        const r = opponentSide === 'p1' ? col.p1Reserve : col.p2Reserve;
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
    } catch (e) {
      console.warn('[highlightTargets] failed', e);
    }
    return targets;
  }, [attackMode, state, opponentSide]);

  const attackerColumn: ColumnIndex | null = useMemo(() => {
    if (!state || !attackMode) return null;
    const card = state.cards[attackMode];
    return (card?.column as ColumnIndex) ?? null;
  }, [attackMode, state]);

  const nameOf = useCallback(
    (pid: PlayerId): string | null => {
      if (!roomInfo) return null;
      return decodeAnonName(pid === 'p1' ? roomInfo.ownerName : roomInfo.guestName);
    },
    [roomInfo],
  );

  useEffect(() => {
    if (!rematchNotice) return;
    const t = setTimeout(dismissRematchNotice, 5000);
    return () => clearTimeout(t);
  }, [rematchNotice, dismissRematchNotice]);
  
  
  
  useEffect(() => {
    if (!state) return;
    if (!state.pendingChoice) return;
    if (state.pendingChoice.kind !== 'REPLACE_TARGET_SELECTION') return;
  
    const intent = replaceIntentRef.current;
    replaceIntentRef.current = null;
  
    const eligible = state.pendingChoice.eligibleCardIds;
    const target = intent && eligible.includes(intent)
      ? intent
      : eligible[0];
  
    if (target) {
      dispatch({
        type: 'RESOLVE_CHOICE',
        playerId: state.pendingChoice.playerId,
        cardIds: [target],
      });
    }
  }, [state?.pendingChoice, dispatch]);

  // ─── РАННИЕ RETURN'Ы — ПОСЛЕ ВСЕХ ХУКОВ ───

  if (status.kind === 'connecting') {
    return (
      <div className="online-status-screen">
        <div className="online-status-text">Подключение к комнате {roomCode}…</div>
      </div>
    );
  }

  if (status.kind === 'error') {
    return (
      <div className="online-status-screen">
        <div className="online-status-text online-status-error">
          Ошибка: {status.reason}
        </div>
        <button className="btn-header" onClick={onExit}>← Вернуться</button>
      </div>
    );
  }

  if (opponentExpired) {
    return (
      <div className="online-status-screen">
        <div className="online-status-text online-status-error">
          Комната закрыта из-за неактивности
        </div>
        <button className="btn-header" onClick={onExit}>← Вернуться в лобби</button>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="online-status-screen">
        <div className="online-status-text">Ожидание состояния…</div>
      </div>
    );
  }

  // Игрок без mySide (например, ещё не участник) — ждём.
  if (!isSpectator && !mySide) {
    return (
      <div className="online-status-screen">
        <div className="online-status-text">Ожидание состояния…</div>
      </div>
    );
  }

  // ─── Mulligan ───

  if (state.phase === 'MULLIGAN' && !isSpectator && mySide) {
    const mulliganNames = {
      p1: decodeAnonName(roomInfo?.ownerName),
      p2: decodeAnonName(roomInfo?.guestName),
    };

    if (!roomInfo?.hasGuest) {
      return (
        <div className="online-status-screen">
          <div className="online-status-text">Ожидание второго игрока…</div>
          <div className="online-status-text" style={{ fontSize: 12, color: '#6b7280' }}>
            Код комнаты: <b>{roomCode}</b>
          </div>
          <button className="btn-header" onClick={onExit}>← Выйти</button>
        </div>
      );
    }

    const picker: PlayerId = !state.mulliganDone.p1 ? 'p1' : 'p2';

    if (picker !== mySide) {
      return (
        <div className="online-status-screen">
          <div className="online-status-text">Соперник выбирает стартовую руку…</div>
          <div className="online-status-text" style={{ fontSize: 12, color: '#6b7280' }}>
            Код комнаты: {roomCode}
          </div>
          <TurnTimer
            deadlineAt={turnDeadlineAt}
            owner={turnOwner}
            myPlayerId={mySide}
            names={mulliganNames}
            totalMs={45_000}
          />
        </div>
      );
    }

    return (
      <>
        <MulliganScreen
          state={state}
          currentPicker={picker}
          onConfirm={(cardId) =>
            dispatch({ type: 'MULLIGAN', playerId: picker, cardId })
          }
        />
        <div
          style={{
            position: 'fixed',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
          }}
        >
          <TurnTimer
            deadlineAt={turnDeadlineAt}
            owner={turnOwner}
            myPlayerId={mySide}
            names={mulliganNames}
            totalMs={45_000}
          />
        </div>
      </>
    );
  }

  // ─── Игровое поле ───

  const activePlayer = state.activePlayer;
  const canAct = !isSpectator && isMyTurn;
  const opponentSideSafe: PlayerId = opponentSide ?? 'p2';
  const mySideSafe: PlayerId = mySide ?? 'p1';
	
  const opponentDisconnectedAt =
    opponentSideSafe === 'p1'
      ? roomInfo?.ownerDisconnectedAt ?? null
      : roomInfo?.guestDisconnectedAt ?? null;
  
  const opponentIsOffline = !!opponentDisconnectedAt;
  const canAllowTakeover =
    !isSpectator &&
    !!opponentDisconnectedAt &&
    !roomInfo?.takeoverOpenFor &&
    nowTick - opponentDisconnectedAt > 30_000;
  
  const opponentId: string | null =
    opponentSideSafe === 'p1'
      ? roomInfo?.ownerId ?? null
      : roomInfo?.guestId ?? null;
  
  const canOpenOpponent =
    !!opponentId && !opponentId.startsWith('anon:') && !opponentIsBot;

  const opponentDisplayName: string | null = (() => {
  	if (opponentIsBot && roomInfo?.guestId) {
	  const botId = roomInfo.guestId.slice('anon:bot:'.length);
	  return `🤖 ${botDisplayName(botId)}`;
	}
	return nameOf(opponentSideSafe);
  })();

  const handlePlay = (cardId: CardInstanceId) => {
    if (isSpectator || !mySide) return;
    if (!canAct || state.phase !== 'PLAY') return;
    setReplaceMode(null);
    setSelectedCardId(cardId);
  };

  const handleReplace = (cardId: CardInstanceId) => {
    if (isSpectator || !mySide) return;
    if (!canAct || state.phase !== 'PLAY') return;
    setSelectedCardId(null);
    setAttackMode(null);
    setReplaceMode(cardId);
  };

  const handleAbilityClick = (cardId: CardInstanceId) => {
    if (isSpectator || !mySide || !canAct) return;
    const card = state.cards[cardId];
    if (!card) return;
    const def = state.definitions[card.definitionId];
    const abilities = def.activatedAbilities ?? [];
    const affordable = abilities
      .map((a, i) => ({ a, i }))
      .filter(({ a, i }) => !card.usedAbilitiesThisTurn.includes(i) && state.players[mySide].influence >= a.cost);

    if (affordable.length === 1) {
      dispatch({ type: 'USE_ABILITY', playerId: mySide, cardId, abilityIndex: affordable[0].i });
    } else if (affordable.length > 1) {
      setCardMenu(cardId);
    }
  };
  
  const handleSlotClick = (
    column: number,
    owner: 'p1' | 'p2',
    zone: 'FRONT' | 'RESERVE',
    cardId: CardInstanceId | null,
  ) => {
    if (isSpectator || !mySide) return;
    if (!canAct) return;
  
    if (replaceMode) {
      if (!cardId) return;
      if (owner !== mySide) return;
      const isCandidate = replaceCandidates.some((c) => c.cardId === cardId);
      if (!isCandidate) return;
      replaceIntentRef.current = cardId;
      dispatch({ type: 'REPLACE_CARD', playerId: mySide, cardId: replaceMode });
      setReplaceMode(null);
      return;
    }
  
    if (selectedCardId) {
      if (owner !== mySide) return;
      if (zone !== 'RESERVE') return;
      if (cardId !== null) return;
      dispatch({
        type: 'PLAY_CARD',
        playerId: mySide,
        cardId: selectedCardId,
        column: column as ColumnIndex,
      });
      setSelectedCardId(null);
      return;
    }

    if (attackMode) {
      if (owner === mySide) return;
      if (!cardId) return;
      if (!highlightTargets.has(cardId)) return;
      dispatch({
        type: 'ATTACK',
        playerId: mySide,
        attackerId: attackMode,
        target: { kind: 'CARD', cardId },
      });
      setAttackMode(null);
      return;
    }

    if (!cardId) return;
    if (owner !== mySide) return;
    if (zone !== 'FRONT') return;

    const card = state.cards[cardId];
    const def = state.definitions[card.definitionId];
    const canAttack = !card.exhausted && state.phase === 'COMBAT';

    if (canAttack) {
        setAttackMode(cardId);
      return;
    }

    const abilities = def.activatedAbilities ?? [];
    const affordable = abilities
      .map((a, i) => ({ a, i }))
      .filter(({ a, i }) => !card.usedAbilitiesThisTurn.includes(i) && state.players[mySide].influence >= a.cost);

    if (affordable.length > 0) {
      setCardMenu(cardId);
    }
  };

  const handleNeutralClick = (column: ColumnIndex) => {
    if (isSpectator || !mySide) return;
    if (!canAct || !attackMode) return;
    dispatch({
      type: 'ATTACK',
      playerId: mySide,
      attackerId: attackMode,
      target: { kind: 'NEUTRAL', column },
    });
    setAttackMode(null);
  };

  const handleGuildAttack = () => {
    if (isSpectator || !mySide) return;
    if (!canAct || !attackMode) return;
    dispatch({
      type: 'ATTACK',
      playerId: mySide,
      attackerId: attackMode,
      target: { kind: 'GUILD', playerId: opponentSideSafe },
    });
    setAttackMode(null);
  };

  const handleNext = () => {
    if (isSpectator || !mySide) return;
    if (!canAct) return;
    dispatch({ type: 'ADVANCE_PHASE', playerId: mySide });
  };

  const handleEndTurn = () => {
    if (isSpectator || !mySide) return;
    if (!canAct) return;
    dispatch({ type: 'END_TURN', playerId: mySide });
  };

  const handleChoice = (cardIds: CardInstanceId[]) => {
    if (isSpectator || !mySide) return;
    if (!state.pendingChoice) return;
    if (state.pendingChoice.playerId !== mySide) return;
    dispatch({
      type: 'RESOLVE_CHOICE',
      playerId: state.pendingChoice.playerId,
      cardIds,
    });
  };
  
  const handleCancelChoice = () => {
	if (isSpectator || !mySide) return;
    const choice = state.pendingChoice;
    if (!choice) return;
    if (
      choice.kind === 'REPLACE_TARGET_SELECTION' ||
      choice.kind === 'ACTIVATION_DISCARD'
    ) {
      dispatch({ type: 'CANCEL_CHOICE', playerId: choice.playerId });
    } else {
      dispatch({
        type: 'RESOLVE_CHOICE',
        playerId: choice.playerId,
        cardIds: [],
      });
    }
  };
  
  let cardMenuOptions: ActionOption[] = [];
  let cardMenuTitle = '';
  let cardMenuSubtitle = '';
  if (cardMenu && mySide) {
    const card = state.cards[cardMenu];
    const def = state.definitions[card.definitionId];
    cardMenuTitle = def.name;
    const abilities = def.activatedAbilities ?? [];
        const isFront = card.zone === 'FRONT';
    const ownerControlsCol2 = state.board[1].neutralOwner === card.ownerId;
    let displayStr = card.baseStrength;
    for (const m of card.modifiers) if (m.stat === 'strength') displayStr += m.delta;
    if (isFront && ownerControlsCol2) displayStr += 1;
    
    cardMenuSubtitle =
      `⚔ ${Math.max(0, displayStr)} · ❤ ${card.baseHealth - card.damageTaken}` +
      (card.exhausted ? ' · истощён' : '');

    if (abilities.length > 0 && (state.phase === 'PLAY' || state.phase === 'COMBAT')) {
      abilities.forEach((a: any, idx: number) => {
        const used = card.usedAbilitiesThisTurn.includes(idx);
        const canAfford = state.players[mySide].influence >= a.cost;
        if (!used && canAfford) {
          cardMenuOptions.push({
            label: `⚡ ${a.name ?? a.id} (${a.cost}💧)`,
            onSelect: () => {
              dispatch({ type: 'USE_ABILITY', playerId: mySide, cardId: cardMenu, abilityIndex: idx });
              setCardMenu(null);
            },
          });
        }
      });
    }
  }

  const opponentFrontEmpty = frontCount(state, opponentSideSafe) === 0;
  const bothPlayersReady = !!(roomInfo?.ownerId && roomInfo?.guestId);

  const iProposed =
    !isSpectator && rematchProposedBy != null && rematchProposedBy === mySide;
  const theyProposed =
    !isSpectator && rematchProposedBy != null && rematchProposedBy !== mySide;
  const proposerName = rematchProposedBy
    ? nameOf(rematchProposedBy) ?? 'Соперник'
    : '';
  
  const topSide: PlayerId = isSpectator ? 'p1' : opponentSideSafe;
  const bottomSide: PlayerId = isSpectator ? 'p2' : mySideSafe;

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-title">
          <h1>Аспекты</h1>
          <span className={`turn-badge turn-${activePlayer}`}>
            Ход: {nameOf(activePlayer) ?? activePlayer.toUpperCase()}
          </span>
          <span className="online-room-badge">🔗 {roomCode}</span>
          {isSpectator ? (
            <span
              className="online-role-badge"
              style={{
                background: '#1a1526',
                color: '#c0a0ff',
                borderColor: '#3a2a5a',
              }}
            >
              👁 Наблюдатель
            </span>
          ) : (
            <span className="online-role-badge">
              Вы — {nameOf(mySideSafe) ?? mySideSafe.toUpperCase()}
            </span>
          )}
        </div>
        <TurnTimer
          deadlineAt={turnDeadlineAt}
          owner={turnOwner}
          myPlayerId={mySideSafe}
          names={{
            p1: decodeAnonName(roomInfo?.ownerName),
            p2: decodeAnonName(roomInfo?.guestName),
          }}
          totalMs={90_000}
        />
        <div className="app-header-actions">
          {!isSpectator && (
            <button
              className="btn-concede"
              onClick={async () => {
                const ok = await confirm({
                  title: 'Сдаться?',
                  message: 'Соперник победит немедленно.',
                  confirmLabel: 'Сдаться',
                  danger: true,
                });
                if (ok) concede();
              }}
            >
              🏳 Сдаться
            </button>
          )}
		  {canAllowTakeover && mySide && (
            <button
              className="btn-header btn-takeover"
              onClick={async () => {
                try {
                  await onlineApi.allowTakeover(
                    roomCode,
                    opponentSideSafe,
                  );
                } catch (e) {
                  console.warn('[takeover] failed', e);
                }
              }}
            >
              👥 Разрешить takeover
            </button>
          )}
          <button className="btn-header" onClick={onExit}>🚪 Выйти</button>
        </div>
      </header>

      {!bothPlayersReady && (
        <div className="online-waiting">
          ⏳ Ожидание второго игрока… Код комнаты: <b>{roomCode}</b>
        </div>
      )}
	  {opponentIsOffline && !roomInfo?.takeoverOpenFor && (
        <div className="online-waiting">
          ⏸ Соперник отключился. Таймер на паузе.{' '}
          {canAllowTakeover
            ? 'Можно разрешить любому занять его место.'
            : 'Подождите 30 секунд, чтобы разрешить takeover…'}
        </div>
      )}
      
      {roomInfo?.takeoverOpenFor && (
        <div className="online-waiting online-waiting-takeover">
          🔄 Ожидание нового игрока. Код комнаты: <b>{roomCode}</b>
        </div>
      )}

      <div className="app-body">
        <div className="app-left">
          <div
            className={canOpenOpponent ? 'opponent-panel-clickable' : ''}
            onClick={
              canOpenOpponent
                ? () => openProfile(opponentId!)
                : undefined
            }
          >
            <PlayerPanel
              state={state}
              playerId={opponentSideSafe}
              isActive={activePlayer === opponentSideSafe}
              handCountOverride={opponentHandCount}
              displayName={opponentDisplayName}
			  floatings={floatingsByPos.get(`guild:${opponentSideSafe}`)}
            />
          </div>

          <Board
            state={state}
            onSlotClick={handleSlotClick}
            onNeutralClick={handleNeutralClick}
            highlightTargets={highlightTargets}
            highlightSources={highlightSources}
            playMode={!isSpectator && !!selectedCardId}
            attackMode={!isSpectator && !!attackMode}
            attackerColumn={attackerColumn}
            floatingsByPos={floatingsByPos}
            replaceCosts={replaceCosts}
			onAbilityClick={!isSpectator ? handleAbilityClick : undefined}
			localPlayerId={mySideSafe}
          />

          <div className="hint-container">
            {!isSpectator && !canAct && !state.winner && (
              <div className="hint">
                {state.activePlayer === mySide ? 'Ожидание…' : 'Ход соперника'}
              </div>
            )}
            {!isSpectator && canAct && replaceMode && (() => {
              const costs = replaceCandidates.map((c) => c.cost);
              const minC = costs.length ? Math.min(...costs) : 0;
              const maxC = costs.length ? Math.max(...costs) : 0;
              const costText = costs.length === 0
                ? '—'
                : minC === maxC ? `${minC}💰` : `${minC}–${maxC}💰`;
              return (
                <div className="hint hint-with-actions">
                  <div>
                    Кликните по цели. Стоимость замены: <b>{costText}</b>.
                  </div>
                  <button className="hint-cancel" onClick={() => setReplaceMode(null)}>
                    ✕ Отмена
                  </button>
                </div>
              );
            })()}
			{!isSpectator && canAct && selectedCardId && (
              <div className="hint hint-with-actions">
                <div>Кликните по пустому слоту Резерва (1–5)</div>
                <button className="hint-cancel" onClick={() => setSelectedCardId(null)}>
                  ✕ Отмена
                </button>
              </div>
            )}
            {!isSpectator && canAct && attackMode && (
              <div className="hint hint-with-actions">
                <div>Кликните по подсвеченной цели или нейтралу</div>
                <div className="hint-buttons">
                  {opponentFrontEmpty && (
                    <button className="hint-action" onClick={handleGuildAttack}>
                      ⚔ Атаковать гильдию
                    </button>
                  )}
                  <button className="hint-cancel" onClick={() => setAttackMode(null)}>
                    ✕ Отмена
                  </button>
                </div>
              </div>
            )}
          </div>

          <PlayerPanel
            state={state}
            playerId={bottomSide}
            isActive={activePlayer === bottomSide}
            displayName={nameOf(bottomSide)}
			floatings={floatingsByPos.get(`guild:${bottomSide}`)}
          />

          {isSpectator ? (
            <div className="hand hand-empty hand-spectator">
              👁 Вы наблюдаете за партией
            </div>
          ) : (
            <>
              <Hand
                state={state}
                playerId={mySideSafe}
                onPlay={handlePlay}
                onReplace={handleReplace}
                selectedCardId={selectedCardId}
                disabled={!canAct}
              />
              <PhaseControls
                state={state}
                onNext={handleNext}
                onEndTurn={handleEndTurn}
                disabled={!canAct}
              />
            </>
          )}
        </div>
        <div className="app-right">
          <Log entries={log} />
        </div>
      </div>

      {cardMenu && cardMenuOptions.length > 0 && (
        <ActionMenu
          title={cardMenuTitle}
          subtitle={cardMenuSubtitle}
          options={cardMenuOptions}
          onCancel={() => setCardMenu(null)}
        />
      )}
	  
	  {!isSpectator && state.pendingChoice && state.pendingChoice.playerId === mySide && (
        <ChoicePrompt
          state={state}
          onSubmit={handleChoice}
          onCancel={handleCancelChoice}
        />
      )}

      {!isSpectator && (
        <VictoryModal
          state={state}
          myPlayerId={mySide}
          playerNames={{
            p1: decodeAnonName(roomInfo?.ownerName),
            p2: decodeAnonName(roomInfo?.guestName),
          }}
          onNewGame={proposeRematch}
          onExit={onExit}
          newGameLabel="Реванш"
          newGameDisabled={iProposed || opponentIsBot}
          newGameDisabledLabel={opponentIsBot ? 'Бот уходит…' : 'Ожидание соперника…'}
          exitLabel={opponentIsBot ? 'В лобби' : 'Выйти в лобби'}
          extraHint={
			iProposed
			  ? 'Предложение отправлено. Соперник может принять или отказаться.'
			  : opponentIsBot
				? 'Это был бот. Сыграйте ещё раз, чтобы встретить другого соперника.'
				: null
          }
		  ratingUpdate={ratingUpdate}
        />
      )}
	  {isSpectator && state.winner && (
        <div className="spectator-result-overlay">
          <div className="spectator-result">
            <div className="spectator-result-emoji">🏆</div>
            <div className="spectator-result-title">
              {nameOf(state.winner) ?? state.winner.toUpperCase()} победил
            </div>
            <div className="spectator-result-reason">
              {state.winnerReason === 'glory_zero'
                ? 'Величие противника достигло нуля'
                : state.winnerReason === 'alt_victory'
                  ? 'Захвачены все нейтральные клетки'
                  : state.winnerReason === 'concede'
                    ? 'Соперник сдался'
                    : (state.winnerReason ?? '')}
            </div>
          </div>
        </div>
      )}

      {!isSpectator && state.winner && theyProposed && (
        <RematchDialog
          fromName={proposerName || 'Соперник'}
          onAccept={() => respondRematch(true)}
          onDecline={() => respondRematch(false)}
        />
      )}

      {!isSpectator && rematchNotice && (
        <div className="rematch-toast">
          {rematchNotice.kind === 'declined'
            ? `Соперник (${rematchNotice.byName}) отказался от реванша`
            : 'Время ожидания реванша истекло'}
        </div>
      )}

      {opponentLeft && !isSpectator && (
        <OpponentLeftDialog
          name={opponentLeft.name}
          onWait={dismissOpponentLeft}
          onExit={onExit}
        />
      )}
    </div>
  );
}