import { useEffect, useState } from 'react';
import type {
  RoomPublicInfo,
  CreateRoomDto,
  JoinRoomDto,
  DeckDto,
} from '@aspects/shared';
import { getDecks, listPacks, seriesOfDeck } from '@aspects/cards';
import type { AuthState } from '../game/useAuth';
import { onlineApi } from '../game/onlineApi';
import { AuthBadge } from './AuthBadge';
import { AnonNameModal } from './AnonNameModal';
import { getAnonName } from '../game/anonId';
import { ErrorToast } from './ErrorToast';
import {
  extractErrorMessage,
  localizeErrorMessage,
} from '../game/errorMessage';
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

function seriesNames(series: string[]): string {
  return series
    .map((id) => PACKS.find((p) => p.id === id)?.name ?? id)
    .join(', ');
}

export function OnlineLobbyScreen({
  auth,
  savedDecks,
  onBack,
  onJoinRoom,
  onSpectateRoom,
  onQuickPlay,
  initialJoinCode,
}: Props) {
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
  const [deckId, setDeckId] = useState(() => {
    const d = getDecks()[0];
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

  // Дефолт для join — первая колода
  useEffect(() => {
    if (!roomLookup) return;
    if (joinDeckId) return;
    const d = getDecks()[0];
    if (d) setJoinDeckId(`preset:${d.id}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomLookup]);

  // Подтягиваем комнату по коду
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
      return getDecks().find((x) => x.id === id)?.cards ?? null;
    }
    return null;
  };

  // Проверка, что карта колоды принадлежит одной из серий комнаты
  const deckFitsSeries = (
    deckValue: string,
    allowed: string[],
  ): boolean => {
    if (allowed.length === 0) return true;
    const cards = resolveCards(deckValue);
    if (!cards) return false;
    const deckSeries = seriesOfDeck(cards);
    return deckSeries.every((s) => allowed.includes(s));
  };

  const handleCreate = async () => {
    setError(null);
    const cards = resolveCards(deckId);
    if (!cards || cards.length !== 30) {
      setError('Выбранная колода должна содержать ровно 30 карт');
      return;
    }
    const series = seriesOfDeck(cards);
    if (series.length === 0 || series.length > 4) {
      setError(
        `Колода использует ${series.length} серий. Нужно от 1 до 4.`,
      );
      return;
    }
    setLoading(true);
    try {
      const resolvedId = deckId.replace(/^(preset|saved):/, '');
      const dto: CreateRoomDto = {
        series,
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
    const allowed = roomLookup?.series ?? [];
    if (allowed.length > 0 && !deckFitsSeries(joinDeckId, allowed)) {
      setError(
        `Серии комнаты: «${seriesNames(allowed)}». Выберите совместимую колоду.`,
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
      await onlineApi.takeover(roomLookup.code, roomLookup.takeoverOpenFor);
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

  const allDecks = getDecks();
  const allPresets = allDecks;

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

          <label className="setup-label">
            Ваша колода
            <span className="online-form-locked">
              {' '}· серии определяются автоматически
            </span>
          </label>
          <select
            className="online-form-select"
            value={deckId}
            onChange={(e) => setDeckId(e.target.value)}
          >
            {allPresets.length > 0 && (
              <optgroup label="Пресеты">
                {allPresets.map((d) => (
                  <option key={`preset:${d.id}`} value={`preset:${d.id}`}>
                    {d.name}
                  </option>
                ))}
              </optgroup>
            )}
            {savedDecks.length > 0 && (
              <optgroup label="Мои колоды">
                {savedDecks.map((d) => (
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

          {roomLookup && roomLookup.series.length > 0 && (
            <label className="setup-label">
              Серии комнаты
              <span className="online-form-locked">
                {' '}· {seriesNames(roomLookup.series)}
              </span>
            </label>
          )}

          <label className="setup-label">Ваша колода</label>
          {!roomLookup?.takeoverOpenFor && (
            <select
              className="online-form-select"
              value={joinDeckId}
              onChange={(e) => setJoinDeckId(e.target.value)}
              disabled={!roomLookup}
            >
              <optgroup label="Пресеты">
                {allPresets.map((d) => (
                  <option key={`preset:${d.id}`} value={`preset:${d.id}`}>
                    {d.name}
                  </option>
                ))}
              </optgroup>
              {savedDecks.length > 0 && (
                <optgroup label="Мои колоды">
                  {savedDecks.map((d) => (
                    <option key={`saved:${d.id}`} value={`saved:${d.id}`}>
                      {d.name} ({d.cardIds.length})
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          )}

          {roomLookup?.takeoverOpenFor ? (
            <>
              <div className="takeover-info">
                <div className="takeover-info-title">
                  🔄 Свободное место:{' '}
                  {roomLookup.takeoverOpenFor === 'p1' ? 'P1' : 'P2'}
                </div>
                <div className="takeover-info-desc">
                  Хозяин разрешил занять освободившееся место. Вы продолжите
                  партию с текущего состояния — карты и ход сохранятся.
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