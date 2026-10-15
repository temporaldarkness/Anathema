import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import type Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { createGame } from '@aspects/engine';
import {
  getCards,
  getDecks,
  getPack,
  mergedCardsById,
} from '@aspects/cards';
import type {
  RoomState,
  RoomPublicInfo,
  CreateRoomDto,
  JoinRoomDto,
} from '@aspects/shared';
import { REDIS_CLIENT } from './redis.provider';
import type { GameState, PlayerId } from '@aspects/engine';
import { EventsService } from '../common/events.service';

const ROOM_TTL_SECONDS = 60 * 60;
const REMATCH_TTL_MS = 30_000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

function generateCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

@Injectable()
export class RoomsService {
  private readonly allCards: ReturnType<typeof getCards>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly events: EventsService,
  ) {
    this.allCards = getCards('stormwind');
  }

  // ─── Создание ───

  async create(
    userId: string,
    username: string,
    dto: CreateRoomDto,
  ): Promise<RoomState> {
    const series = dto.series;
    if (series.length === 0 || series.length > 4) {
      throw new BadRequestException('series must have 1..4 entries');
    }

    const cardDefs = mergedCardsById(series);
    if (Object.keys(cardDefs).length === 0) {
      throw new BadRequestException('No cards found for the given series');
    }

    const firstPackDecks = getDecks(series[0]);

    const p1Cards =
      dto.deckP1Cards && dto.deckP1Cards.length > 0
        ? dto.deckP1Cards
        : firstPackDecks.find((d) => d.id === dto.deckP1Id)?.cards ?? [];
    if (p1Cards.length !== 30) {
      throw new BadRequestException('Deck P1 must have exactly 30 cards');
    }

    const placeholderP2 =
      firstPackDecks[1]?.cards ?? firstPackDecks[0]?.cards ?? p1Cards;

    const seed = `room-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const initial = createGame({
      seed,
      decks: { p1: p1Cards, p2: placeholderP2 },
      cardDefinitions: cardDefs,
      useMulligan: true,
    });

    const code = generateCode();
    const room: RoomState = {
      code,
      ownerId: userId,
      ownerName: username,
      guestId: null,
      guestName: null,
      series,
      gameState: initial.state,
      deckP1: p1Cards,
      deckP2: null,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      version: 0,
      turnDeadlineAt: null,
      turnOwner: null,
      turnKey: null,
      rematchProposedBy: null,
      rematchProposedAt: null,
      allowSpectators: dto.allowSpectators ?? false,
      spectatorIds: [],
      seed,
      commands: [],
      matchSaved: false,
      ratingApplied: false,
      ownerDisconnectedAt: null,
      guestDisconnectedAt: null,
      takeoverOpenFor: null,
    };

    await this.redis.setex(
      `aspects:room:${code}`,
      ROOM_TTL_SECONDS,
      JSON.stringify(room),
    );
    await this.redis.sadd(`aspects:user_rooms:${userId}`, code);

    await this.audit.log({
      user_id: userId,
      username,
      action: 'create_room',
      entity_type: 'room',
      entity_id: code,
      details: { series },
    });

    return room;
  }

  // ─── Присоединение ───

  async join(
    userId: string,
    username: string,
    code: string,
    dto: JoinRoomDto,
  ): Promise<RoomState> {
    const room = await this.get(code);
    if (!room) throw new NotFoundException('Room not found');
    if (room.ownerId === userId) {
      throw new BadRequestException('Cannot join your own room');
    }

    if (room.guestId === userId) {
      room.guestName = username;
      room.lastActivityAt = Date.now();
      await this.save(room);
      return room;
    }

    if (room.guestId && room.guestId !== userId) {
      const presenceKey = `aspects:presence:${room.code}`;
      const currentGuest = await this.redis.get(presenceKey);

      if (currentGuest === room.guestId) {
        throw new BadRequestException('Room is full');
      }

      room.guestId = null;
      room.guestName = null;
    }

    const roomSeries = room.series ?? [];
    const cardDefs = mergedCardsById(roomSeries);
    if (Object.keys(cardDefs).length === 0) {
      throw new BadRequestException('Room has no valid series');
    }
    const firstPackDecks = getDecks(roomSeries[0]);

    const p2Cards =
      dto.deckP2Cards && dto.deckP2Cards.length > 0
        ? dto.deckP2Cards
        : firstPackDecks.find((d) => d.id === dto.deckP2Id)?.cards ?? [];
    if (p2Cards.length !== 30) {
      throw new BadRequestException('Deck P2 must have exactly 30 cards');
    }

    const p1Cards = room.deckP1;
    if (!p1Cards || p1Cards.length !== 30) {
      throw new BadRequestException('Room has invalid P1 deck');
    }

    const seed = `room-${room.code}-${room.createdAt}`;
    const initial = createGame({
      seed,
      decks: { p1: p1Cards, p2: p2Cards },
      cardDefinitions: cardDefs,
      useMulligan: true,
    });

    room.guestId = userId;
    room.guestName = username;
    room.gameState = initial.state;
    room.deckP2 = p2Cards;
    room.seed = seed;
    room.commands = [];
    room.matchSaved = false;
    room.ratingApplied = false;
    room.lastActivityAt = Date.now();
    room.version += 1;
    room.rematchProposedBy = null;
    room.rematchProposedAt = null;
    room.guestDisconnectedAt = null;

    this.updateTurnDeadline(room);

    await this.save(room);
    await this.redis.sadd(`aspects:user_rooms:${userId}`, code);

    await this.audit.log({
      user_id: userId,
      username,
      action: 'join_room',
      entity_type: 'room',
      entity_id: code,
      details: {},
    });

    return room;
  }

  // ─── Чтение / запись ───

  async get(code: string): Promise<RoomState | null> {
    const raw = await this.redis.get(`aspects:room:${code}`);
    if (!raw) return null;
    return JSON.parse(raw) as RoomState;
  }

  async save(room: RoomState): Promise<void> {
    room.lastActivityAt = Date.now();
    await this.redis.setex(
      `aspects:room:${room.code}`,
      ROOM_TTL_SECONDS,
      JSON.stringify(room),
    );
  }

  // ─── Выход ───

  async leave(userId: string, code: string): Promise<void> {
    const room = await this.get(code);

    if (!room) {
      await this.redis.srem(`aspects:user_rooms:${userId}`, code);
      return;
    }

    if (room.ownerId === userId) {
      await this.redis.del(`aspects:room:${code}`);
      await this.redis.del(`aspects:presence:${code}`);
      if (room.guestId) {
        await this.redis.srem(`aspects:user_rooms:${room.guestId}`, code);
      }
      for (const sid of room.spectatorIds ?? []) {
        await this.redis.srem(`aspects:user_rooms:${sid}`, code);
      }
    } else if (room.guestId === userId) {
      room.guestId = null;
      room.guestName = null;
      room.deckP2 = null;
      room.rematchProposedBy = null;
      room.rematchProposedAt = null;
      room.guestDisconnectedAt = null;
      if (room.takeoverOpenFor === 'p2') room.takeoverOpenFor = null;
      await this.save(room);
      await this.redis.del(`aspects:presence:${code}`);
    } else if (room.spectatorIds?.includes(userId)) {
      room.spectatorIds = room.spectatorIds.filter((id) => id !== userId);
      await this.save(room);
    }

    await this.redis.srem(`aspects:user_rooms:${userId}`, code);
  }

  // ─── Мои комнаты ───

  async listMine(userId: string): Promise<RoomPublicInfo[]> {
    const codes = await this.redis.smembers(`aspects:user_rooms:${userId}`);
    const result: RoomPublicInfo[] = [];

    for (const code of codes) {
      const room = await this.get(code);
      if (!room) {
        await this.redis.srem(`aspects:user_rooms:${userId}`, code);
        continue;
      }
      if (room.ownerId !== userId && room.guestId !== userId) continue;

      const state = room.gameState as { winner?: string | null };
      const isBotRoom = room.guestId?.startsWith('anon:bot:') ?? false;
      if (isBotRoom && state?.winner) {
        await this.redis.srem(`aspects:user_rooms:${userId}`, code);
        continue;
      }

      result.push(this.toPublic(room));
    }
    return result;
  }

  // ─── Реванш ───

  async rematch(code: string, actorUserId: string): Promise<RoomState> {
    const room = await this.get(code);
    if (!room) throw new NotFoundException('Room not found');

    const isOwner = room.ownerId === actorUserId;
    const isGuest = room.guestId === actorUserId;
    if (!isOwner && !isGuest) {
      throw new ForbiddenException('Only room participants can rematch');
    }
    if (!room.guestId) {
      throw new BadRequestException('Opponent has not joined yet');
    }

    const p1Cards = room.deckP1;
    const p2Cards = room.deckP2;
    if (!p1Cards || p1Cards.length !== 30) {
      throw new BadRequestException('Room has invalid P1 deck');
    }
    if (!p2Cards || p2Cards.length !== 30) {
      throw new BadRequestException('Room has invalid P2 deck');
    }

    const roomSeries = room.series ?? [];
    const cardDefs = mergedCardsById(roomSeries);
    if (Object.keys(cardDefs).length === 0) {
      throw new BadRequestException('Room has no valid series');
    }

    const seed = `room-${code}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const initial = createGame({
      seed,
      decks: { p1: p1Cards, p2: p2Cards },
      cardDefinitions: cardDefs,
      useMulligan: true,
    });

    room.gameState = initial.state;
    room.version += 1;
    room.lastActivityAt = Date.now();
    room.rematchProposedBy = null;
    room.rematchProposedAt = null;
    room.seed = seed;
    room.commands = [];
    room.matchSaved = false;
    room.ratingApplied = false;

    this.updateTurnDeadline(room);
    await this.save(room);

    await this.audit.log({
      user_id: actorUserId,
      username: room.ownerName,
      action: 'rematch',
      entity_type: 'room',
      entity_id: code,
    });

    return room;
  }

  // ─── Приглашения ───

  async inviteToRoom(
    code: string,
    fromUserId: string,
    toUserIds: string[],
  ): Promise<{ invited: number; skipped: number }> {
    const room = await this.get(code);
    if (!room) throw new NotFoundException('Room not found');

    const isOwner = room.ownerId === fromUserId;
    const isGuest = room.guestId === fromUserId;
    if (!isOwner && !isGuest) {
      throw new ForbiddenException('Not a room participant');
    }

    const fromName = isOwner ? room.ownerName : room.guestName ?? 'Игрок';
    const roomSeries = room.series ?? [];

    let invited = 0;
    let skipped = 0;

    for (const toId of toUserIds) {
      if (toId === fromUserId) { skipped++; continue; }
      if (toId === room.ownerId || toId === room.guestId) { skipped++; continue; }
      if (!toId || toId.startsWith('anon:')) { skipped++; continue; }

      this.events.toUser(toId, 'room_invite_received', {
        roomCode: room.code,
        fromUserId,
        fromUsername: fromName,
        series: roomSeries,
      });
      invited++;
    }

    await this.audit.log({
      user_id: fromUserId,
      username: fromName,
      action: 'invite_to_room',
      entity_type: 'room',
      entity_id: code,
      details: { invited, skipped },
    });

    return { invited, skipped };
  }

  // ─── Revenge proposal ───

  async proposeRematch(code: string, playerId: PlayerId): Promise<RoomState | null> {
    const room = await this.get(code);
    if (!room) return null;
    room.rematchProposedBy = playerId;
    room.rematchProposedAt = Date.now();
    await this.save(room);
    return room;
  }

  async clearRematchProposal(code: string): Promise<RoomState | null> {
    const room = await this.get(code);
    if (!room) return null;
    if (!room.rematchProposedBy && !room.rematchProposedAt) return room;
    room.rematchProposedBy = null;
    room.rematchProposedAt = null;
    await this.save(room);
    return room;
  }

  // ─── Takeover ───

  async markDisconnected(code: string, seat: 'p1' | 'p2'): Promise<void> {
    const room = await this.get(code);
    if (!room) return;
    if (seat === 'p1') room.ownerDisconnectedAt = Date.now();
    else room.guestDisconnectedAt = Date.now();
    await this.save(room);
  }

  async markReconnected(code: string, seat: 'p1' | 'p2'): Promise<void> {
    const room = await this.get(code);
    if (!room) return;
    let changed = false;
    if (seat === 'p1') {
      if (room.ownerDisconnectedAt) {
        room.ownerDisconnectedAt = null;
        changed = true;
      }
      if (room.takeoverOpenFor === 'p1') {
        room.takeoverOpenFor = null;
        changed = true;
      }
    } else {
      if (room.guestDisconnectedAt) {
        room.guestDisconnectedAt = null;
        changed = true;
      }
      if (room.takeoverOpenFor === 'p2') {
        room.takeoverOpenFor = null;
        changed = true;
      }
    }
    if (changed) await this.save(room);
  }

  async allowTakeover(
    code: string,
    byUserId: string,
    seat: 'p1' | 'p2',
  ): Promise<void> {
    const room = await this.get(code);
    if (!room) throw new NotFoundException('Room not found');

    const liveIsOwner = room.ownerId === byUserId;
    const liveIsGuest = room.guestId === byUserId;
    if (!liveIsOwner && !liveIsGuest) {
      throw new ForbiddenException('Not a room participant');
    }
    if (seat === 'p1' && !liveIsGuest) {
      throw new ForbiddenException('Only guest can allow p1 takeover');
    }
    if (seat === 'p2' && !liveIsOwner) {
      throw new ForbiddenException('Only owner can allow p2 takeover');
    }

    const disconnectedAt =
      seat === 'p1' ? room.ownerDisconnectedAt : room.guestDisconnectedAt;
    if (!disconnectedAt) {
      throw new BadRequestException('Seat is not disconnected');
    }
    if (Date.now() - disconnectedAt < 30_000) {
      throw new BadRequestException('Wait at least 30 seconds');
    }

    room.takeoverOpenFor = seat;
    await this.save(room);
  }

  async claimSeat(
    code: string,
    userId: string,
    username: string,
    seat: 'p1' | 'p2',
  ): Promise<void> {
    const room = await this.get(code);
    if (!room) throw new NotFoundException('Room not found');

    if (room.takeoverOpenFor !== seat) {
      throw new BadRequestException('Seat is not open for takeover');
    }

    if (seat === 'p1') {
      room.ownerId = userId;
      room.ownerName = username;
      room.ownerDisconnectedAt = null;
    } else {
      room.guestId = userId;
      room.guestName = username;
      room.guestDisconnectedAt = null;
    }
    room.takeoverOpenFor = null;

    this.updateTurnDeadline(room);
    await this.save(room);
  }

  isRematchExpired(room: RoomState): boolean {
    if (!room.rematchProposedBy) return false;
    const at = room.rematchProposedAt ?? 0;
    return Date.now() - at > REMATCH_TTL_MS;
  }

  // ─── Публичный вид комнаты ───

  toPublic(room: RoomState): RoomPublicInfo {
    const state = room.gameState as { winner?: string | null } | null;
    let status: RoomPublicInfo['status'] = 'waiting';
    if (state?.winner) status = 'finished';
    else if (room.guestId) status = 'ready';

    const series = room.series ?? [];

    return {
      code: room.code,
      ownerId: room.ownerId,
      ownerName: room.ownerName,
      guestId: room.guestId,
      guestName: room.guestName,
      series,
      createdAt: room.createdAt,
      hasGuest: !!room.guestId,
      status,
      turnDeadlineAt: room.turnDeadlineAt,
      turnOwner: room.turnOwner,
      allowSpectators: room.allowSpectators ?? false,
      spectatorCount: room.spectatorIds?.length ?? 0,
      ownerDisconnectedAt: room.ownerDisconnectedAt ?? null,
      guestDisconnectedAt: room.guestDisconnectedAt ?? null,
      takeoverOpenFor: room.takeoverOpenFor ?? null,
    };
  }

  // ─── Таймеры ───

  private static readonly MULLIGAN_MS = 45_000;
  private static readonly TURN_MS = 90_000;

  updateTurnDeadline(room: RoomState): void {
    if (room.ownerDisconnectedAt || room.guestDisconnectedAt) {
      room.turnDeadlineAt = null;
      return;
    }
    if (!room.guestId) {
      room.turnDeadlineAt = null;
      room.turnOwner = null;
      room.turnKey = null;
      return;
    }

    const state = room.gameState as GameState;
    if (state.winner) {
      room.turnDeadlineAt = null;
      room.turnOwner = null;
      room.turnKey = null;
      return;
    }

    let owner: 'p1' | 'p2';
    let duration: number;
    let turnKey: string;

    if (state.phase === 'MULLIGAN') {
      owner = !state.mulliganDone.p1 ? 'p1' : 'p2';
      duration = RoomsService.MULLIGAN_MS;
      turnKey = `mulligan:${owner}`;
    } else {
      owner = state.activePlayer;
      duration = RoomsService.TURN_MS;
      turnKey = `turn:${state.turnNumber}:${state.activePlayer}`;
    }

    if (room.turnKey !== turnKey) {
      room.turnOwner = owner;
      room.turnKey = turnKey;
      room.turnDeadlineAt = Date.now() + duration;
    }
  }

  // ─── Сталость / очистка ───

  private static readonly STALE_MS = 15 * 60 * 1000;

  async findStaleRooms(): Promise<string[]> {
    const keys = await this.redis.keys('aspects:room:*');
    const stale: string[] = [];
    for (const key of keys) {
      const code = key.replace('aspects:room:', '');
      if (
        code.includes('presence') ||
        code.includes('lock') ||
        code.includes('user_rooms')
      ) {
        continue;
      }
      const room = await this.get(code);
      if (!room) continue;
      if (Date.now() - room.lastActivityAt > RoomsService.STALE_MS) {
        stale.push(code);
      }
    }
    return stale;
  }

  async forceDelete(code: string): Promise<void> {
    const room = await this.get(code);
    if (!room) return;
    await this.redis.del(`aspects:room:${code}`);
    await this.redis.del(`aspects:presence:${code}`);
    if (room.ownerId) {
      await this.redis.srem(`aspects:user_rooms:${room.ownerId}`, code);
    }
    if (room.guestId) {
      await this.redis.srem(`aspects:user_rooms:${room.guestId}`, code);
    }
    for (const sid of room.spectatorIds ?? []) {
      await this.redis.srem(`aspects:user_rooms:${sid}`, code);
    }
  }

  // ─── Spectators ───

  async addSpectator(code: string, userId: string): Promise<RoomState | null> {
    const room = await this.get(code);
    if (!room) return null;
    if (!room.allowSpectators) return null;
    room.spectatorIds = room.spectatorIds ?? [];
    if (!room.spectatorIds.includes(userId)) {
      room.spectatorIds.push(userId);
    }
    await this.save(room);
    return room;
  }

  async removeSpectator(code: string, userId: string): Promise<void> {
    const room = await this.get(code);
    if (!room) return;
    if (!room.spectatorIds?.includes(userId)) return;
    room.spectatorIds = room.spectatorIds.filter((id) => id !== userId);
    await this.save(room);
  }

  // ─── Бот-комната ───

  async createWithBot(
    userId: string,
    username: string,
    dto: CreateRoomDto,
    botId: string,
    botName: string,
  ): Promise<RoomState> {
    const room = await this.create(userId, username, dto);

    const roomSeries = room.series ?? [];
    const cardDefs = mergedCardsById(roomSeries);
    const decks = getDecks(roomSeries[0]);
    if (decks.length === 0) {
      throw new BadRequestException('Pack has no preset decks for bot');
    }

    const botDeck = decks[Math.floor(Math.random() * decks.length)].cards;
    if (botDeck.length !== 30) {
      throw new BadRequestException('Bot deck must have 30 cards');
    }

    const seed = `bot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const initial = createGame({
      seed,
      decks: { p1: room.deckP1, p2: botDeck },
      cardDefinitions: cardDefs,
      useMulligan: true,
    });

    room.guestId = `anon:bot:${botId}`;
    room.guestName = botName;
    room.deckP2 = botDeck;
    room.gameState = initial.state;
    room.seed = seed;
    room.commands = [];
    room.matchSaved = false;
    room.version += 1;

    this.updateTurnDeadline(room);
    await this.save(room);

    return room;
  }
}