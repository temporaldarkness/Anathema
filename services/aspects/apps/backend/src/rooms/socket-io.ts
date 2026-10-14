import { Server, Socket } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import Redis from 'ioredis';
import { applyCommand, type Command, type GameState, type PlayerId } from '@aspects/engine';
import { RoomsService } from './rooms.service';
import { RoomsModule } from './rooms.module';
import { readAnonFromCookie } from '../common/anon-cookie';
import { MatchmakingService } from '../matchmaking/matchmaking.service';
import { MatchmakingModule } from '../matchmaking/matchmaking.module';
import { RatingService, tierFor } from '../rating/rating.service';
import { RatingModule } from '../rating/rating.module';
import { makeBot, botDisplayName } from '@aspects/bot';
import { MatchesService } from '../matches/matches.service';
import { MatchesModule } from '../matches/matches.module';
import type { CommandRecord } from '@aspects/shared';
import { EventsService } from '../common/events.service';
import { EventsModule } from '../common/events.module';

let redisClient: Redis | null = null;
function getRedis(): Redis {
  if (!redisClient) {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error('REDIS_URL is not set');
    redisClient = new Redis(url);
  }
  return redisClient;
}

let sessionRedisClient: Redis | null = null;
function getSessionRedis(): Redis {
  if (!sessionRedisClient) {
    const url = process.env.WEBWAY_REDIS_URL ?? process.env.REDIS_URL;
    if (!url) throw new Error('WEBWAY_REDIS_URL is not set');
    sessionRedisClient = new Redis(url);
  }
  return sessionRedisClient;
}

const GUEST_PRESENCE_TTL_SECONDS = 30;
const GUEST_HEARTBEAT_MS = 15_000;

function presenceKey(roomCode: string): string {
  return `aspects:presence:${roomCode}`;
}

async function markGuestPresence(roomCode: string, userId: string): Promise<void> {
  await getRedis().setex(presenceKey(roomCode), GUEST_PRESENCE_TTL_SECONDS, userId);
}

async function clearGuestPresence(roomCode: string): Promise<void> {
  await getRedis().del(presenceKey(roomCode));
}

function safeHandler<Args extends unknown[]>(
  name: string,
  fn: (...args: Args) => Promise<void> | void,
): (...args: Args) => void {
  return (...args: Args) => {
    try {
      const r = fn(...args);
      if (r && typeof (r as Promise<void>).catch === 'function') {
        (r as Promise<void>).catch((e) => {
          console.error(`[ws] handler '${name}' failed:`, e);
        });
      }
    } catch (e) {
      console.error(`[ws] handler '${name}' threw:`, e);
    }
  };
}

async function getUserFromCookie(
  cookieHeader: string | undefined,
): Promise<{ userId: string; username: string } | null> {
  if (!cookieHeader) return null;
  const cookieName = process.env.SESSION_COOKIE_NAME ?? 'session_id';
  const parts = cookieHeader.split(';').map((p) => p.trim());
  let sessionId: string | null = null;
  for (const p of parts) {
    const [name, ...rest] = p.split('=');
    if (name === cookieName) {
      sessionId = rest.join('=');
      break;
    }
  }
  if (!sessionId) return null;

  try {
    const redis = getSessionRedis();
    const raw = await redis.get(`session:${sessionId}`);
    if (!raw) return null;

    const idMatch = raw.match(/"user_id"\s*:\s*"?(\d+)"?/);
    if (!idMatch) return null;
    const userId = idMatch[1];

    const nameMatch = raw.match(/"username"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    let username = 'Гость';
    if (nameMatch) {
      try {
        username = JSON.parse(`"${nameMatch[1]}"`);
      } catch {
        username = nameMatch[1];
      }
    }
    return { userId, username };
  } catch {
    return null;
  }
}

export function attachSocketIo(
  httpServer: HttpServer,
  app: NestFastifyApplication,
): void {
  const io = new Server(httpServer, {
    path: '/socket.io',
    cors: { origin: true, credentials: true },
    transports: ['websocket', 'polling'],
  });

  const rooms = app.select(RoomsModule).get(RoomsService);
  const matches = app.select(MatchesModule).get(MatchesService);
  const matchmaking = app.select(MatchmakingModule).get(MatchmakingService);
  const rating = app.select(RatingModule).get(RatingService);
  const events = app.select(EventsModule).get(EventsService);
  events.attach(io);
  
  /**
   * Считает и сохраняет рейтинг. Возвращает дельты (или null если
   * рейтинг не применим — анонимы/боты/уже применён).
   */
  async function tryApplyRating(
    roomCode: string,
  ): Promise<{
    winnerDelta: string;
    loserDelta: string;
    winnerAfter: number;
    loserAfter: number;
  } | null> {
    const room = await rooms.get(roomCode);
    if (!room) return null;
    if (room.ratingApplied) return null;
  
    const state = room.gameState as GameState;
    if (!state.winner) return null;
  
    const winnerIsP1 = state.winner === 'p1';
    const winnerId = winnerIsP1 ? room.ownerId : room.guestId;
    const loserId = winnerIsP1 ? room.guestId : room.ownerId;
    const winnerName = winnerIsP1 ? room.ownerName : room.guestName;
    const loserName = winnerIsP1 ? room.guestName : room.ownerName;
  
    if (!winnerId || !loserId || !winnerName || !loserName) return null;
  
    let deltas: Awaited<ReturnType<typeof rating.applyMatch>> = null;
    try {
      deltas = await rating.applyMatch(
        { id: winnerId, name: winnerName },
        { id: loserId, name: loserName },
      );
    } catch (e) {
      console.error('[rating] applyMatch failed:', e);
    }
  
    room.ratingApplied = true;
    await rooms.save(room);
    return deltas;
  }
  
  /**
   * Считает рейтинг и эмитит `rating_updated` каждому игроку.
   * Это то, что должны вызывать обработчики game_over.
   */
  async function applyRatingAndNotify(roomCode: string): Promise<void> {
    const room = await rooms.get(roomCode);
    if (!room) return;
  
    const state = room.gameState as GameState;
    if (!state.winner) return;
  
    const deltas = await tryApplyRating(roomCode);
    if (!deltas) return;
  
    const winnerIsP1 = state.winner === 'p1';
    const winnerId = winnerIsP1 ? room.ownerId : room.guestId;
    const loserId = winnerIsP1 ? room.guestId : room.ownerId;
  
    if (winnerId && !winnerId.startsWith('anon:')) {
      io.to(`user:${winnerId}`).emit('rating_updated', {
        side: 'winner',
        delta: deltas.winnerDelta,
        after: deltas.winnerAfter,
        tier: tierFor(deltas.winnerAfter),
      });
    }
    if (loserId && !loserId.startsWith('anon:')) {
      io.to(`user:${loserId}`).emit('rating_updated', {
        side: 'loser',
        delta: deltas.loserDelta,
        after: deltas.loserAfter,
        tier: tierFor(deltas.loserAfter),
      });
    }
  }
  
  /**
   * Сохраняет онлайн-матч в БД. Идемпотентно через room.matchSaved.
   * Сохраняется, если хотя бы один из игроков — Webway.
   */
  async function saveMatchOnce(roomCode: string): Promise<void> {
    const room = await rooms.get(roomCode);
    if (!room) return;
    if (room.matchSaved) return;
  
    const state = room.gameState as GameState;
    if (!state.winner) return;
    if (!room.seed || !room.commands) {
      console.warn(`[matches] ${roomCode}: no seed or commands, skipping`);
      room.matchSaved = true;
      await rooms.save(room);
      return;
    }
  
    const isBotRoom = room.guestId?.startsWith('anon:bot:') ?? false;
  
    const ownerIdForDb = room.ownerId.startsWith('anon:') ? null : room.ownerId;
    const guestIdForDb =
      room.guestId && !room.guestId.startsWith('anon:') ? room.guestId : null;
  
    // Правило: сохраняем, если ХОТЯ БЫ ОДИН из игроков — Webway.
    if (!ownerIdForDb && !guestIdForDb) {
      room.matchSaved = true;
      await rooms.save(room);
      return;
    }
  
    const p2BotName = isBotRoom && room.guestId
      ? room.guestId.slice('anon:bot:'.length)
      : null;
  
    const dto = {
      packId: room.packId,
      seed: room.seed,
      player1Name: room.ownerName,
      player2Name: room.guestName ?? 'Соперник',
      winnerId: state.winner,
      winnerReason: state.winnerReason ?? null,
      turnNumber: state.turnNumber,
      durationMs: Date.now() - room.createdAt,
      p1BotName: null,
      p2BotName,
      deckP1: room.deckP1,
      deckP2: room.deckP2 ?? [],
      commands: room.commands,
      player1Id: ownerIdForDb,
      player2Id: guestIdForDb,
    };
  
    try {
      const attribution = ownerIdForDb ?? guestIdForDb!;
      const attributionName = ownerIdForDb
        ? room.ownerName
        : (room.guestName ?? 'Гость');
      await matches.save(attribution, attributionName, dto);
      room.matchSaved = true;
      await rooms.save(room);
      console.log(
        `[matches] saved ${roomCode} (winner=${state.winner}, ` +
        `p1=${ownerIdForDb ?? 'anon'}, p2=${guestIdForDb ?? 'anon'})`,
      );
    } catch (e) {
      console.error(`[matches] save failed for ${roomCode}:`, e);
    }
  }
  
  /** Записывает команду в историю партии. */
  function recordCommand(
    room: { commands?: CommandRecord[] },
    playerId: 'p1' | 'p2',
    command: Command,
  ): void {
    if (!room.commands) room.commands = [];
    room.commands.push({
      sequence: room.commands.length,
      playerId,
      command,
    } as CommandRecord);
  }

  async function emitPersonalized(
    roomCode: string,
    events: unknown[],
    mode: 'sync' | 'update',
  ): Promise<void> {
    const fullRoom = await rooms.get(roomCode);
    if (!fullRoom) return;
  
    const gameState = fullRoom.gameState as GameState;
    const sockets = await io.in(`room:${roomCode}`).fetchSockets();
    const spectatorIds = fullRoom.spectatorIds ?? [];
  
    for (const s of sockets) {
      const sid = (s.data as { userId?: string }).userId;
      if (!sid) continue;
  
      const isOwner = fullRoom.ownerId === sid;
      const isGuest = fullRoom.guestId === sid;
      const isSpectator = spectatorIds.includes(sid);
      if (!isOwner && !isGuest && !isSpectator) continue;
  
      let myPid: 'p1' | 'p2' | null = null;
      let visibleState: GameState;
      let opponentHandCount: number | null = null;
  
      if (isSpectator) {
        // Обе руки скрыты — spectator видит только доску и счётчики.
        visibleState = {
          ...gameState,
          players: {
            p1: { ...gameState.players.p1, hand: [] },
            p2: { ...gameState.players.p2, hand: [] },
          },
        };
      } else {
        myPid = isOwner ? 'p1' : 'p2';
        const oppPid: 'p1' | 'p2' = myPid === 'p1' ? 'p2' : 'p1';
        opponentHandCount = gameState.players[oppPid].hand.length;
        visibleState = {
          ...gameState,
          players: {
            ...gameState.players,
            [oppPid]: { ...gameState.players[oppPid], hand: [] },
          },
        };
      }
  
      const payload = {
        state: visibleState,
        version: fullRoom.version,
        roomInfo: rooms.toPublic(fullRoom),
        events,
        myPlayerId: myPid,
        opponentHandCount,
        turnDeadlineAt: fullRoom.turnDeadlineAt,
        turnOwner: fullRoom.turnOwner,
        rematchProposedBy: fullRoom.rematchProposedBy ?? null,
        role: isSpectator ? 'spectator' : 'player',
      };
  
      if (mode === 'sync') s.emit('state_sync', payload);
      else s.emit('state_update', payload);
    }
  }

  function nameOf(room: { ownerName: string; guestName: string | null }, pid: PlayerId): string {
    if (pid === 'p1') return room.ownerName;
    return room.guestName ?? 'Соперник';
  }

  async function emitRematchUpdate(
    roomCode: string,
    event: 'sync' | 'proposed' | 'declined' | 'expired',
    byName?: string,
  ): Promise<void> {
    const room = await rooms.get(roomCode);
    if (!room) return;
    io.to(`room:${roomCode}`).emit('rematch_update', {
      proposedBy: room.rematchProposedBy ?? null,
      event,
      byName,
    });
  }

  io.on('connection', async (socket: Socket) => {
    let userId: string | null = null;
    let username = 'Аноним';

    const auth = await getUserFromCookie(socket.handshake.headers.cookie);
    if (auth) {
      userId = auth.userId;
      username = auth.username;
    }

    if (!userId) {
      const { anonId, anonName } = readAnonFromCookie(socket.handshake.headers.cookie);
      if (anonId) {
        userId = `anon:${anonId}`;
        username = anonName ?? 'Аноним';
      }
    }

    if (!userId) {
      socket.emit('command_error', { reason: 'not_authenticated', expectedVersion: 0 });
      socket.disconnect();
      return;
    }

    (socket.data as { userId?: string }).userId = userId;
	socket.join(`user:${userId}`);
    let roomCode: string | null = null;

    console.log(`[ws] connected ${socket.id} (user=${userId})`);

    socket.on(
      'subscribe',
      safeHandler(
        'subscribe',
        async (payload: { roomCode: string; role?: 'player' | 'spectator' }) => {
          const code = payload.roomCode.toUpperCase();
          const role: 'player' | 'spectator' =
            payload.role === 'spectator' ? 'spectator' : 'player';
    
          const room = await rooms.get(code);
          if (!room) {
            socket.emit('command_error', { reason: 'room_not_found', expectedVersion: 0 });
            return;
          }
    
          // ─── Spectator branch ───
          if (role === 'spectator') {
            if (!room.allowSpectators) {
              socket.emit('command_error', {
                reason: 'spectators_disabled',
                expectedVersion: 0,
              });
              return;
            }
    
            // Spectator не обязан быть owner/guest — только не участником.
            if (room.ownerId === userId || room.guestId === userId) {
              // Участник не может «наблюдать за собой» — оставляем его игроком.
            } else {
              await rooms.addSpectator(code, userId!);
            }
    
            if (roomCode) socket.leave(`room:${roomCode}`);
            roomCode = code;
            socket.join(`room:${code}`);
            await emitPersonalized(code, [], 'sync');
            return;
          }
    
          // ─── Player branch ───
          const isOwner = room.ownerId === userId;
          const isGuest = room.guestId === userId;
          if (!isOwner && !isGuest) {
            socket.emit('command_error', { reason: 'not_in_room', expectedVersion: 0 });
            return;
          }
    
          if (roomCode) socket.leave(`room:${roomCode}`);
          roomCode = code;
          socket.join(`room:${code}`);
    
          if (isGuest) {
            await markGuestPresence(code, userId!);
            const hb = setInterval(() => {
              markGuestPresence(code, userId!).catch(() => {});
            }, GUEST_HEARTBEAT_MS);
            (socket.data as { heartbeat?: NodeJS.Timeout }).heartbeat = hb;
          }
          
          // Возврат на своё место — снимаем «disconnected».
          if (isOwner) await rooms.markReconnected(code, 'p1');
          if (isGuest) await rooms.markReconnected(code, 'p2');
          
          // Пересчитываем таймер (может быть на паузе — теперь запускаем заново).
          const freshRoom = await rooms.get(code);
          if (freshRoom) {
            rooms.updateTurnDeadline(freshRoom);
            await rooms.save(freshRoom);
          }
    
          if (room.rematchProposedBy) {
            if (rooms.isRematchExpired(room)) {
              await rooms.clearRematchProposal(code);
            } else {
              socket.emit('rematch_update', {
                proposedBy: room.rematchProposedBy,
                event: 'sync',
              });
            }
          } else {
            socket.emit('rematch_update', { proposedBy: null, event: 'sync' });
          }
    
          // Уведомляем остальных в комнате, что мы вернулись.
          const myPid: PlayerId = isOwner ? 'p1' : 'p2';
          socket.to(`room:${code}`).emit('opponent_joined', {
            side: myPid,
            name: username,
          });
    
          await emitPersonalized(code, [], 'sync');
    
          if (isGuest) {
            socket.to(`room:${code}`).emit('guest_joined', {
              guestName: username,
              roomInfo: rooms.toPublic(room),
            });
          }
        },
      ),
    );

    socket.on(
      'command',
      safeHandler(
        'command',
        async (payload: { command: Command; expectedVersion: number }) => {
          if (!roomCode) {
            socket.emit('command_error', { reason: 'not_subscribed', expectedVersion: payload.expectedVersion });
            return;
          }
          const room = await rooms.get(roomCode);
          if (!room) {
            socket.emit('command_error', { reason: 'room_not_found', expectedVersion: payload.expectedVersion });
            return;
          }
          if (payload.expectedVersion !== room.version) {
            await emitPersonalized(roomCode, [], 'sync');
            return;
          }
          const isOwner = room.ownerId === userId;
          const isGuest = room.guestId === userId;
          if (!isOwner && !isGuest) {
            socket.emit('command_error', { reason: 'not_in_room', expectedVersion: payload.expectedVersion });
            return;
          }
          const playerId: 'p1' | 'p2' = isOwner ? 'p1' : 'p2';
          const cmdPlayerId =
            'playerId' in (payload.command as any)
              ? (payload.command as any).playerId
              : null;
          if (cmdPlayerId && cmdPlayerId !== playerId) {
            socket.emit('command_error', { reason: 'not_your_command', expectedVersion: payload.expectedVersion });
            return;
          }
          const state = room.gameState as GameState;
          const result = applyCommand(state, payload.command);
          if (result.events.some((e) => e.type === 'COMMAND_REJECTED')) {
            socket.emit('command_error', { reason: 'command_rejected', expectedVersion: payload.expectedVersion });
            return;
          }
		  recordCommand(room, playerId, payload.command);
          room.gameState = result.state;
          room.version += 1;
          rooms.updateTurnDeadline(room);
          await rooms.save(room);

          await emitPersonalized(roomCode, result.events, 'update');

          if (result.state.winner) {
            io.to(`room:${room.code}`).emit('game_over', {
              winner: result.state.winner,
              reason: result.state.winnerReason ?? '',
            });
			
			applyRatingAndNotify(roomCode).catch((e) =>
              console.error('[rating] apply+notify failed:', e),
            );
			saveMatchOnce(roomCode).catch((e) =>
              console.error('[matches] save failed (auto):', e),
            );
          }
        },
      ),
    );

    // ─── Revenge: предложение реванша ───

    socket.on(
      'rematch_propose',
      safeHandler('rematch_propose', async () => {
        if (!roomCode) {
          socket.emit('command_error', { reason: 'not_subscribed', expectedVersion: 0 });
          return;
        }
        const room = await rooms.get(roomCode);
        if (!room) {
          socket.emit('command_error', { reason: 'room_not_found', expectedVersion: 0 });
          return;
        }
        const isOwner = room.ownerId === userId;
        const isGuest = room.guestId === userId;
        if (!isOwner && !isGuest) {
          socket.emit('command_error', { reason: 'not_in_room', expectedVersion: 0 });
          return;
        }
        if (!room.guestId) {
          socket.emit('command_error', { reason: 'no_opponent', expectedVersion: 0 });
          return;
        }

        const state = room.gameState as GameState;
        if (!state.winner) {
          socket.emit('command_error', { reason: 'game_not_over', expectedVersion: room.version });
          return;
        }
        if (room.rematchProposedBy && !rooms.isRematchExpired(room)) {
          // Уже есть активное предложение — просто синхронизируем статус.
          socket.emit('rematch_update', {
            proposedBy: room.rematchProposedBy,
            event: 'sync',
          });
          return;
        }

        const myPid: PlayerId = isOwner ? 'p1' : 'p2';
        const updated = await rooms.proposeRematch(roomCode, myPid);
        if (!updated) {
          socket.emit('command_error', { reason: 'room_not_found', expectedVersion: 0 });
          return;
        }

        await emitRematchUpdate(roomCode, 'proposed', username);
      }),
    );

    // ─── Revenge: ответ на предложение ───

    socket.on(
      'rematch_respond',
      safeHandler(
        'rematch_respond',
        async (payload: { accept: boolean }) => {
          if (!roomCode) {
            socket.emit('command_error', { reason: 'not_subscribed', expectedVersion: 0 });
            return;
          }
          const room = await rooms.get(roomCode);
          if (!room) {
            socket.emit('command_error', { reason: 'room_not_found', expectedVersion: 0 });
            return;
          }
          const isOwner = room.ownerId === userId;
          const isGuest = room.guestId === userId;
          if (!isOwner && !isGuest) {
            socket.emit('command_error', { reason: 'not_in_room', expectedVersion: 0 });
            return;
          }

          const myPid: PlayerId = isOwner ? 'p1' : 'p2';
          if (room.rematchProposedBy === myPid) {
            socket.emit('command_error', { reason: 'rematch_not_yours', expectedVersion: 0 });
            return;
          }
          if (!room.rematchProposedBy) {
            socket.emit('command_error', { reason: 'no_pending_rematch', expectedVersion: 0 });
            return;
          }

          if (rooms.isRematchExpired(room)) {
            await rooms.clearRematchProposal(roomCode);
            await emitRematchUpdate(roomCode, 'expired');
            return;
          }

          if (!payload.accept) {
            await rooms.clearRematchProposal(roomCode);
            await emitRematchUpdate(roomCode, 'declined', username);
            return;
          }

          try {
            await rooms.rematch(roomCode, userId!);
          } catch (e) {
            console.error('[ws] rematch failed:', e);
            await rooms.clearRematchProposal(roomCode);
            socket.emit('command_error', { reason: 'rematch_failed', expectedVersion: room.version });
            await emitRematchUpdate(roomCode, 'expired');
            return;
          }

          await emitRematchUpdate(roomCode, 'sync');
          await emitPersonalized(roomCode, [], 'sync');
        },
      ),
    );

    socket.on(
      'concede',
      safeHandler('concede', async () => {
        if (!roomCode) return;
        const room = await rooms.get(roomCode);
        if (!room) return;
        const state = room.gameState as GameState;
        if (state.winner) return;
        const isOwner = room.ownerId === userId;
        const isGuest = room.guestId === userId;
        if (!isOwner && !isGuest) return;

        const myPid: 'p1' | 'p2' = isOwner ? 'p1' : 'p2';
        const oppPid: 'p1' | 'p2' = myPid === 'p1' ? 'p2' : 'p1';

        room.gameState = {
          ...state,
          winner: oppPid,
          winnerReason: 'concede',
        };
        room.version += 1;
        room.turnDeadlineAt = null;
        room.turnOwner = null;
        await rooms.save(room);

        await emitPersonalized(roomCode, [], 'update');

        io.to(`room:${roomCode}`).emit('game_over', {
          winner: oppPid,
          reason: 'concede',
        });
        
        applyRatingAndNotify(roomCode).catch((e) =>
          console.error('[rating] apply+notify failed:', e),
        );
        saveMatchOnce(roomCode).catch((e) =>
          console.error('[matches] save failed (concede):', e),
        );
      }),
    );

    socket.on(
      'disconnect',
      safeHandler('disconnect', async () => {
        const hb = (socket.data as { heartbeat?: NodeJS.Timeout }).heartbeat;
        if (hb) clearInterval(hb);

        await matchmaking.dequeue(userId).catch(() => {});
		
		if (roomCode) {
          const room = await rooms.get(roomCode);
          if (room) {
            if (room.guestId === userId) {
              await clearGuestPresence(roomCode);
            }
            const myPid: PlayerId | null =
              room.ownerId === userId ? 'p1' : room.guestId === userId ? 'p2' : null;
            if (myPid && room.rematchProposedBy === myPid) {
              await rooms.clearRematchProposal(roomCode);
              await emitRematchUpdate(roomCode, 'expired');
            }
            if (room.spectatorIds?.includes(userId)) {
              await rooms.removeSpectator(roomCode, userId);
            }
        
            // Игрок вышел со своего места → помечаем «offline» и ставим таймер на паузу.
            if (myPid && !(room.guestId?.startsWith('anon:bot:'))) {
              // Проверяем, есть ли ЕЩЁ активные сокеты того же userId в комнате.
              // Это защищает от race: старый сокет умирает уже ПОСЛЕ того,
              // как новый сокет того же игрока сделал subscribe.
              const peers = await io.in(`room:${roomCode}`).fetchSockets();
              const stillConnected = peers.some((s) => {
                if (s.id === socket.id) return false;
                return (s.data as { userId?: string }).userId === userId;
              });
            
              if (stillConnected) {
                console.log(
                  `[ws] ${userId} still has another live socket in ${roomCode}, skip markDisconnected`,
                );
              } else {
                await rooms.markDisconnected(roomCode, myPid);
                const freshRoom = await rooms.get(roomCode);
                if (freshRoom) {
                  rooms.updateTurnDeadline(freshRoom);
                  await rooms.save(freshRoom);
                  await emitPersonalized(roomCode, [], 'sync');
                }
              }
            }
          }
          socket.to(`room:${roomCode}`).emit('guest_left', { guestName: username });
        }
        console.log(`[ws] disconnected ${socket.id}`);
      }),
    );
  });

  setInterval(async () => {
  try {
    // ─── Авто-очистка мёртвых комнат (раз в ~15 минут неактивности) ───
    const stale = await rooms.findStaleRooms();
    for (const code of stale) {
      io.to(`room:${code}`).emit('room_expired', {
        reason: 'inactivity',
      });
      await rooms.forceDelete(code);
      console.log(`[ws] expired stale room ${code}`);
    }

    const keys = await getRedis().keys('aspects:room:*');
      for (const key of keys) {
        const code = key.replace('aspects:room:', '');
        if (
          code.includes('presence') ||
          code.includes('lock') ||
          code.includes('user_rooms')
        ) {
          continue;
        }
        const room = await rooms.get(code);
        if (!room) continue;
  
        if (room.rematchProposedBy && rooms.isRematchExpired(room)) {
          await rooms.clearRematchProposal(code);
          await emitRematchUpdate(code, 'expired');
        }
  
        if (!room.turnDeadlineAt) continue;
        if (room.turnDeadlineAt > Date.now()) continue;
        if (!room.guestId) continue;
  
        const state = room.gameState as GameState;
        if (state.winner) continue;
  
        let cmd: Command;
        if (state.phase === 'MULLIGAN') {
          const picker: 'p1' | 'p2' = !state.mulliganDone.p1 ? 'p1' : 'p2';
          cmd = { type: 'MULLIGAN', playerId: picker, cardId: null };
        } else {
          cmd = { type: 'END_TURN', playerId: state.activePlayer };
        }
  
        const result = applyCommand(state, cmd);
        if (result.events.some((e) => e.type === 'COMMAND_REJECTED')) {
	      console.warn(`[ws] auto-action rejected on ${code}: ${cmd.type} in ${state.phase}`);
          continue;
        }
  
        recordCommand(room, state.activePlayer, cmd);
		room.gameState = result.state;
        room.version += 1;
        rooms.updateTurnDeadline(room);
        await rooms.save(room);
  
        console.log(`[ws] auto-action on ${code}: ${cmd.type}`);
  
        await emitPersonalized(code, result.events, 'update');
  
        if (result.state.winner) {
          io.to(`room:${room.code}`).emit('game_over', {
            winner: result.state.winner,
            reason: result.state.winnerReason ?? '',
          });
          applyRatingAndNotify(room.code).catch((e) =>
            console.error('[rating] apply+notify failed:', e),
          );
	      saveMatchOnce(code).catch((e) =>
            console.error('[matches] save failed (auto):', e),
          );
        }
      }
    } catch (e) {
      console.error('[ws] timer check failed', e);
    }
  }, 5000);
  
  // ─── Матчмейкинг: тик раз в секунду ───
  setInterval(async () => {
    try {
      // 1. Обычный матчинг (двое живых игроков)
      const matches = await matchmaking.tryMatch();
      for (const m of matches) {
        io.to(`user:${m.user1Id}`).emit('matchmaking_found', {
          roomCode: m.roomCode,
          opponentName: m.user2Name,
        });
        io.to(`user:${m.user2Id}`).emit('matchmaking_found', {
          roomCode: m.roomCode,
          opponentName: m.user1Name,
        });
      }
  
      // 2. Fallback на бота для тех, кто долго ждёт
      const botMatches = await matchmaking.tryFallbackToBot();
      for (const m of botMatches) {
        io.to(`user:${m.userId}`).emit('matchmaking_found', {
          roomCode: m.roomCode,
          opponentName: m.botName,
          opponentIsBot: true,
        });
      }
    } catch (e) {
      console.error('[mm] tick failed', e);
    }
  }, 1000);
  
  // ─── Bot-loop: один ход бота каждые 500ms ───
  setInterval(async () => {
    try {
      const keys = await getRedis().keys('aspects:room:*');
      for (const key of keys) {
        const code = key.replace('aspects:room:', '');
        if (code.includes('presence') || code.includes('lock') || code.includes('user_rooms')) {
          continue;
        }
        const room = await rooms.get(code);
        if (!room) continue;
        if (!room.guestId?.startsWith('anon:bot:')) continue;
  
        const state = room.gameState as GameState;
        if (state.winner) continue;
  
        // Кто действует сейчас?
        let actor: 'p1' | 'p2' | null = null;
        if (state.phase === 'MULLIGAN') {
          actor = !state.mulliganDone.p1 ? 'p1' : 'p2';
        } else if (state.pendingChoice) {
          actor = state.pendingChoice.playerId;
        } else {
          actor = state.activePlayer;
        }
        if (actor !== 'p2') continue;
  
        const botId = room.guestId.slice('anon:bot:'.length);
        let cmd: Command | null = null;
        try {
          const bot = makeBot(botId);
          cmd = bot.chooseCommand(state, 'p2');
        } catch (e) {
          console.error(`[bot] chooseCommand failed on ${code}:`, e);
          continue;
        }
        if (!cmd) continue;
  
        const result = applyCommand(state, cmd);
        if (result.events.some((e) => e.type === 'COMMAND_REJECTED')) {
          // Иногда бот даёт невалидную команду — пропускаем без зависания.
          // Просто завершаем ход форс-мажором, чтобы партия не застыла.
          const fallback: Command =
            state.phase === 'PLAY' || state.phase === 'COMBAT'
              ? { type: 'END_TURN', playerId: 'p2' }
              : { type: 'ADVANCE_PHASE', playerId: 'p2' };
          const r2 = applyCommand(state, fallback);
          if (r2.events.some((e) => e.type === 'COMMAND_REJECTED')) continue;
          room.gameState = r2.state;
          room.version += 1;
          rooms.updateTurnDeadline(room);
          await rooms.save(room);
          await emitPersonalized(code, r2.events, 'update');
          if (r2.state.winner) {
            io.to(`room:${code}`).emit('game_over', {
              winner: r2.state.winner,
              reason: r2.state.winnerReason ?? '',
            });
            applyRatingAndNotify(code).catch((err) =>
              console.error('[rating] apply+notify failed (bot fallback):', err),
            );
          }
          continue;
        }
		
		recordCommand(room, 'p2', cmd);
        room.gameState = result.state;
        room.version += 1;
        rooms.updateTurnDeadline(room);
        await rooms.save(room);
  
        await emitPersonalized(code, result.events, 'update');
  
        if (result.state.winner) {
          io.to(`room:${room.code}`).emit('game_over', {
            winner: result.state.winner,
            reason: result.state.winnerReason ?? '',
          });
          applyRatingAndNotify(room.code).catch((e) =>
            console.error('[rating] apply+notify failed:', e),
          );
          saveMatchOnce(room.code).catch((e) =>
            console.error('[matches] save failed:', e),
          );
        }
      }
    } catch (e) {
      console.error('[bot-loop] failed', e);
    }
  }, 500);

  console.log('[socket.io] attached to http server, path=/socket.io');
}