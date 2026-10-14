import { useEffect, useState } from 'react';
import type {
  RoomPublicInfo,
  CreateRoomDto,
  JoinRoomDto,
  DeckDto,
} from '@aspects/shared';
import { getDecks, listPacks } from '@aspects/cards';
import type { AuthState } from '../game/useAuth';
import { onlineApi } from '../game/onlineApi';
import { AuthBadge } from './AuthBadge';
import { AnonNameModal } from './AnonNameModal';
import { getAnonName } from '../game/anonId';
import { ErrorToast } from './ErrorToast';
import { extractErrorMessage, localizeErrorMessage } from '../game/errorMessage';
import { useOpenProfile } from '../game/profileModal';
import { InviteFriendsModal } from './InviteFriendsModal';
import { useConfirm } from '../game/confirmContext';

interface Props {
  auth: AuthState;
  savedDecks: DeckDto[];
  onBack: () => void;
  onJoinRoom: (roomCode: string) => void;
  onSpectateRoom: (roomCode: string) => void;
  onQuickPlay: () => void;
  initialJoinCode?: string | null;
}

const PACKS = listPacks();

type Mode = 'menu' | 'create' | 'join' | 'spectate';

function packName(packId: string | null | undefined): string {
  if (!packId) return '—';
  return PACKS.find((p) => p.id === packId)?.name ?? packId;
}

export function OnlineLobbyScreen({ auth, savedDecks, onBack, onJoinRoom, onSpectateRoom, onQuickPlay, initialJoinCode }: Props) {
  const [mode, setMode] = useState<Mode>('menu');
  const [needName, setNeedName] = useState(
    auth.kind === 'anonymous' && !getAnonName(),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myRooms, setMyRooms] = useState<RoomPublicInfo[]>([]);
  const [allowSpectators, setAllowSpectators] = useState(false);
  const confirm = useConfirm();

  // ─── Create ───
  const [packId, setPackId] = useState(PACKS[0].id);
  const [deckId, setDeckId] = useState(() => {
    const d = getDecks(PACKS[0].id)[0];
    return d ? `preset:${d.id}` : '';
  });
  
  const [inviteModalRoom, setInviteModalRoom] = useState<string | null>(null);
  
  useEffect(() => {
    if (initialJoinCode) {
      setMode('join');
      setJoinCode(initialJoinCode.toUpperCase());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialJoinCode]);

  // ─── Join ───
  const [joinCode, setJoinCode] = useState('');
  const [joinPackId, setJoinPackId] = useState<string>(PACKS[0].id);
  const [joinDeckId, setJoinDeckId] = useState('');
  const [roomLookup, setRoomLookup] = useState<RoomPublicInfo | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const openProfile = useOpenProfile();

  const loadRooms = async () => {
    if (auth.kind === 'loading') return;
    try {
      const rooms = await onlineApi.listMine();
      setMyRooms(rooms);
    } catch {
      /* пусто */
    }
  };

  useEffect(() => {
    loadRooms();
	const id = setInterval(loadRooms, 20_000);
	return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.kind]);

  // Пак «моей» колоды для join-режима: дефолт — первая колода пака комнаты.
  useEffect(() => {
    if (!roomLookup?.packId) return;
    const decks = getDecks(roomLookup.packId);
    if (decks.length === 0) return;
    const stillValid = joinDeckId.startsWith('saved:')
      ? savedDecks.some(
          (d) => `saved:${d.id}` === joinDeckId && d.packId === roomLookup.packId,
        )
      : getDecks(roomLookup.packId).some((d) => `preset:${d.id}` === joinDeckId);
    if (!stillValid) {
      setJoinDeckId(`preset:${decks[0].id}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomLookup?.packId]);

  // Подтягиваем пак комнаты по мере ввода кода (debounce 350мс).
  useEffect(() => {
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 6) {
      setRoomLookup(null);
      setLookupError(null);
      return;
    }
    let cancelled = false;
    setLookupLoading(true);
    setLookupError(null);
    const t = setTimeout(() => {
      onlineApi
        .getRoom(code)
        .then((room: RoomPublicInfo | null) => {
          if (cancelled) return;
          if (!room) {
            setLookupError('Комната не найдена');
            setRoomLookup(null);
            return;
          }
          setRoomLookup(room);
          if (room.packId) setJoinPackId(room.packId);
        })
        .catch((e: unknown) => {
          if (cancelled) return;
          setLookupError(extractErrorMessage(e));
          setRoomLookup(null);
        })
        .finally(() => {
          if (!cancelled) setLookupLoading(false);
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [joinCode]);

  const resolveCards = (deckValue: string): string[] | null => {
    if (deckValue.startsWith('saved:')) {
      const id = deckValue.slice('saved:'.length);
      return savedDecks.find((d) => d.id === id)?.cardIds ?? null;
    }
    if (deckValue.startsWith('preset:')) {
      const id = deckValue.slice('preset:'.length);
      for (const p of PACKS) {
        const d = getDecks(p.id).find((x) => x.id === id);
        if (d) return d.cards;
      }
    }
    return null;
  };

  const handleCreate = async () => {
    setError(null);
    const cards = resolveCards(deckId);
    if (!cards || cards.length !== 30) {
      setError('Выбранная колода должна содержать ровно 30 карт');
      return;
    }
    setLoading(true);
    try {
      const resolvedId = deckId.replace(/^(preset|saved):/, '');
      const dto: CreateRoomDto = {
        packId,
        deckP1Id: resolvedId,
        deckP1Cards: cards,
        p1BotName: null,
		allowSpectators,
      };
      const room = await onlineApi.createRoom(dto);
      onJoinRoom(room.code);
    } catch (e) {
      setError(localizeErrorMessage(extractErrorMessage(e)));
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    setError(null);
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 6) {
      setError('Введите 6-символьный код комнаты');
      return;
    }
    const cards = resolveCards(joinDeckId);
    if (!cards || cards.length !== 30) {
      setError('Выбранная колода должна содержать ровно 30 карт');
      return;
    }
    if (roomLookup?.packId && roomLookup.packId !== joinPackId) {
      setError(
        `Пак комнаты — «${packName(roomLookup.packId)}». Выберите колоду из этого пака.`,
      );
      return;
    }
    setLoading(true);
    try {
      const resolvedId = joinDeckId.replace(/^(preset|saved):/, '');
      const dto: JoinRoomDto = {
        deckP2Id: resolvedId,
        deckP2Cards: cards,
        p2BotName: null,
      };
      await onlineApi.joinRoom(code, dto);
      onJoinRoom(code);
    } catch (e) {
      setError(localizeErrorMessage(extractErrorMessage(e)));
    } finally {
      setLoading(false);
    }
  };
  
  const handleTakeover = async () => {
    if (!roomLookup?.takeoverOpenFor) return;
    setError(null);
    setLoading(true);
    try {
      await onlineApi.takeover(
        roomLookup.code,
        roomLookup.takeoverOpenFor,
      );
      onJoinRoom(roomLookup.code);
    } catch (e) {
      setError(localizeErrorMessage(extractErrorMessage(e)));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRoom = async (code: string) => {
    const ok = await confirm({
      title: `Удалить комнату ${code}?`,
      message: 'Партия и все связанные данные будут потеряны.',
      confirmLabel: 'Удалить',
      danger: true,
    });
    if (!ok) return;
    setError(null);
    try {
      await onlineApi.leave(code);
      await loadRooms();
    } catch (e) {
      setError(localizeErrorMessage(extractErrorMessage(e)));
    }
  };

  const decksForCreate = getDecks(packId);
  const decksForJoin = roomLookup?.packId
    ? getDecks(roomLookup.packId)
    : getDecks(joinPackId);

  // Фильтр кастомных колод: тот же пак, что у комнаты (или легаси без packId).
  const joinSavedDecks = roomLookup?.packId
    ? savedDecks.filter((d) => !d.packId || d.packId === roomLookup.packId)
    : savedDecks;

  const createSavedDecks = savedDecks.filter(
    (d) => !d.packId || d.packId === packId,
  );

  return (
    <div className="online-screen">
      <AnonNameModal open={needName} onConfirm={() => setNeedName(false)} />
      <ErrorToast message={error} onClose={() => setError(null)} />
      <header className="decks-header">
        <button className="btn-header" onClick={onBack}>← Назад</button>
        <h1 className="decks-title">Онлайн</h1>
        <div className="decks-header-right">
          {auth.kind === 'authenticated' ? (
            <button
              type="button"
              className="profile-link-btn"
              onClick={() => openProfile(auth.user.id)}
              title="Открыть публичный профиль"
            >
              <AuthBadge auth={auth} />
            </button>
          ) : (
            <AuthBadge auth={auth} />
          )}
        </div>
      </header>

      {mode === 'menu' && (
        <div className="online-menu">
          <button
            className="online-menu-btn online-menu-btn-primary"
            onClick={onQuickPlay}
          >
            <div className="online-menu-icon">🔍</div>
            <div className="online-menu-title">Быстрая игра</div>
            <div className="online-menu-desc">
              Найдём соперника автоматически
            </div>
          </button>
		  <button
            className="online-menu-btn online-menu-btn-primary"
            onClick={() => setMode('create')}
          >
            <div className="online-menu-icon">➕</div>
            <div className="online-menu-title">Создать комнату</div>
            <div className="online-menu-desc">
              Вы получите код. Отправьте его другу.
            </div>
          </button>

          <button className="online-menu-btn" onClick={() => setMode('join')}>
            <div className="online-menu-icon">🔗</div>
            <div className="online-menu-title">Присоединиться по коду</div>
            <div className="online-menu-desc">
              Введите 6-символьный код от друга.
            </div>
          </button>
		  <button className="online-menu-btn" onClick={() => setMode('spectate')}>
            <div className="online-menu-icon">👁</div>
            <div className="online-menu-title">Смотреть партию</div>
            <div className="online-menu-desc">
              Подключитесь как наблюдатель по коду комнаты.
            </div>
          </button>

          {myRooms.length > 0 && (
            <div className="online-rooms-list">
              <div className="online-rooms-title">Ваши активные комнаты</div>
              {myRooms.map((r) => (
                <div key={r.code} className="online-room-row">
                  <div className="online-room-code">{r.code}</div>
                  <div className="online-room-info">
                    <span className="online-room-side-tag online-room-side-p1">P1</span>{' '}
                    {r.ownerName}
                    {r.hasGuest && (
                      <>
                        {' vs '}
                        <span className="online-room-side-tag online-room-side-p2">P2</span>{' '}
                        {r.guestName}
                      </>
                    )}
                    {!r.hasGuest && ' (ожидание)'}
                  </div>
				  <span className={`online-room-status online-room-status-${r.status}`}>
                    {r.status === 'waiting'
                    ? 'ожидание'
                    : r.status === 'ready'
                      ? 'в игре'
                      : 'завершена'}
                  </span>
                  <button
                    className="online-room-enter"
                    onClick={() => onJoinRoom(r.code)}
                  >
                    Войти
                  </button>
				  {r.status === 'waiting' && (
                    <button
                      className="online-room-invite"
                      onClick={() => setInviteModalRoom(r.code)}
                      title="Пригласить друзей"
                    >
                      👥
                    </button>
                  )}
                  <button
                    className="online-room-delete"
                    onClick={() => handleDeleteRoom(r.code)}
                    title="Удалить"
                  >
                    🗑
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
	  
	  {mode === 'spectate' && (
        <div className="online-form">
          <div className="online-form-title">Наблюдать за партией</div>
          <label className="setup-label">Код комнаты</label>
          <input
            className="online-form-input"
            placeholder="ABC123"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            maxLength={6}
            autoFocus
          />
          {lookupLoading && (
            <div className="online-lookup-hint">Проверяем комнату…</div>
          )}
          {lookupError && (
            <div className="online-lookup-hint online-lookup-error">{lookupError}</div>
          )}
          {roomLookup && !roomLookup.allowSpectators && (
            <div className="online-lookup-hint online-lookup-error">
              В этой комнате наблюдатели запрещены
            </div>
          )}
          <div className="online-form-actions">
            <button className="btn-header" onClick={() => setMode('menu')}>
              Отмена
            </button>
            <button
              className="btn-header btn-primary"
              onClick={() => onSpectateRoom(joinCode.trim().toUpperCase())}
              disabled={!roomLookup || !roomLookup.allowSpectators}
            >
              Смотреть
            </button>
          </div>
        </div>
      )}

      {mode === 'create' && (
        <div className="online-form">
          <div className="online-form-title">Создать комнату</div>

          <label className="setup-label">Набор карт</label>
          <select
            className="online-form-select"
            value={packId}
            onChange={(e) => {
              setPackId(e.target.value);
              const d = getDecks(e.target.value)[0];
              setDeckId(d ? `preset:${d.id}` : '');
            }}
          >
            {PACKS.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          <label className="setup-label">Ваша колода</label>
          <select
            className="online-form-select"
            value={deckId}
            onChange={(e) => setDeckId(e.target.value)}
          >
            {decksForCreate.length > 0 && (
              <optgroup label="Пресеты">
                {decksForCreate.map((d) => (
                  <option key={`preset:${d.id}`} value={`preset:${d.id}`}>
                    {d.name}
                  </option>
                ))}
              </optgroup>
            )}
            {createSavedDecks.length > 0 && (
              <optgroup label="Мои колоды">
                {createSavedDecks.map((d) => (
                  <option key={`saved:${d.id}`} value={`saved:${d.id}`}>
                    {d.name} ({d.cardIds.length})
                  </option>
                ))}
              </optgroup>
            )}
          </select>

          <div className="online-form-actions">
		    <label className="online-form-checkbox">
              <input
                type="checkbox"
                checked={allowSpectators}
                onChange={(e) => setAllowSpectators(e.target.checked)}
              />
              <span>👁 Разрешить наблюдателей</span>
            </label>
            <button className="btn-header" onClick={() => setMode('menu')}>
              Отмена
            </button>
            <button
              className="btn-header btn-primary"
              onClick={handleCreate}
              disabled={loading}
            >
              {loading ? 'Создание…' : 'Создать комнату'}
            </button>
          </div>
        </div>
      )}

      {mode === 'join' && (
        <div className="online-form">
          <div className="online-form-title">Присоединиться</div>

          <label className="setup-label">Код комнаты</label>
          <input
            className="online-form-input"
            placeholder="ABC123"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            maxLength={6}
            autoFocus
          />

          {lookupLoading && (
            <div className="online-lookup-hint">Проверяем комнату…</div>
          )}
          {lookupError && (
            <div className="online-lookup-hint online-lookup-error">
              {lookupError}
            </div>
          )}

          <label className="setup-label">
            Набор карт комнаты
            {roomLookup?.packId && (
              <span className="online-form-locked">
                {' '}· {packName(roomLookup.packId)} (нельзя сменить)
              </span>
            )}
          </label>
          {!roomLookup?.takeoverOpenFor && (<select
            className="online-form-select"
            value={roomLookup?.packId ?? joinPackId}
            onChange={(e) => setJoinPackId(e.target.value)}
            disabled={!!roomLookup?.packId}
          >
            {PACKS.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>)}

          <label className="setup-label">Ваша колода</label>
          {!roomLookup?.takeoverOpenFor && (<select
            className="online-form-select"
            value={joinDeckId}
            onChange={(e) => setJoinDeckId(e.target.value)}
            disabled={!roomLookup}
          >
            {decksForJoin.length > 0 && (
              <optgroup label="Пресеты">
                {decksForJoin.map((d) => (
                  <option key={`preset:${d.id}`} value={`preset:${d.id}`}>
                    {d.name}
                  </option>
                ))}
              </optgroup>
            )}
            {joinSavedDecks.length > 0 && (
              <optgroup label="Мои колоды">
                {joinSavedDecks.map((d) => (
                  <option key={`saved:${d.id}`} value={`saved:${d.id}`}>
                    {d.name} ({d.cardIds.length})
                  </option>
                ))}
              </optgroup>
            )}
          </select>)}

          {roomLookup?.takeoverOpenFor ? (
            <>
              <div className="takeover-info">
                <div className="takeover-info-title">
                  🔄 Свободное место: {roomLookup.takeoverOpenFor === 'p1' ? 'P1' : 'P2'}
                </div>
                <div className="takeover-info-desc">
                  Хозяин разрешил занять освободившееся место. Вы продолжите партию
                  с текущего состояния — карты и ход сохранятся.
                </div>
              </div>
              <div className="online-form-actions">
                <button className="btn-header" onClick={() => setMode('menu')}>
                  Отмена
                </button>
                <button
                  className="btn-header btn-primary"
                  onClick={handleTakeover}
                  disabled={loading}
                >
                  {loading ? 'Занимаем…' : 'Занять место'}
                </button>
              </div>
            </>
          ) : (
            <div className="online-form-actions">
              <button className="btn-header" onClick={() => setMode('menu')}>
                Отмена
              </button>
              <button
                className="btn-header btn-primary"
                onClick={handleJoin}
                disabled={loading || !roomLookup}
              >
                {loading ? 'Подключение…' : 'Войти в комнату'}
              </button>
            </div>
          )}
        </div>
      )}
		<InviteFriendsModal
          open={!!inviteModalRoom}
          auth={auth}
          alreadyInRoom={
            inviteModalRoom
              ? (() => {
                  const r = myRooms.find((x) => x.code === inviteModalRoom);
                  if (!r) return [];
                  const ids: string[] = [];
                  if (r.ownerId) ids.push(r.ownerId);
                  if (r.guestId) ids.push(r.guestId);
                  return ids;
                })()
              : []
          }
          onInvite={async (userIds) => {
            if (!inviteModalRoom) return;
            await onlineApi.inviteFriends(inviteModalRoom, userIds);
          }}
          onClose={() => setInviteModalRoom(null)}
        />
    </div>
  );
}