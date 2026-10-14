import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../rooms/redis.provider';
import { RoomsService } from '../rooms/rooms.service';
import type { MatchmakingStatusDto } from '@aspects/shared';
import { makeBot, botDisplayName, listAllBotIds } from '@aspects/bot';
import { BotRatingService } from '../rating/bot-rating.service';
import { RatingService } from '../rating/rating.service';

const ENTRY_TTL_SECONDS = 5 * 60;
const QUEUE_PREFIX = 'aspects:mm:queue:';
const ENTRY_PREFIX = 'aspects:mm:entry:';

const BOT_FALLBACK_MS = 15_000;
const BOT_WINDOW_INITIAL = 200;
const BOT_WINDOW_STEP = 50;
const BOT_WINDOW_STEP_MS = 5_000;
const BOT_WINDOW_MAX = 800;

interface QueueEntry {
  userId: string;
  username: string;
  packId: string;
  deckId: string;
  deckCards: string[];
  queuedAt: number;
}

interface MatchResult {
  user1Id: string;
  user2Id: string;
  user1Name: string;
  user2Name: string;
  roomCode: string;
}

export interface BotMatchResult {
  userId: string;
  userName: string;
  roomCode: string;
  botId: string;
  botName: string;
}

@Injectable()
export class MatchmakingService {
  private readonly logger = new Logger(MatchmakingService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly rooms: RoomsService,
	private readonly ratings: RatingService,
    private readonly botRatings: BotRatingService,
  ) {}

  async enqueue(
    userId: string,
    username: string,
    packId: string,
    deckId: string,
    deckCards: string[],
  ): Promise<MatchmakingStatusDto> {
    if (deckCards.length !== 30) {
      throw new BadRequestException('Deck must have exactly 30 cards');
    }

    const existing = await this.getEntry(userId);
    if (existing) {
      // Уже в очереди — идемпотентно вернём текущий статус.
      return this.status(userId);
    }

    // Не разрешаем вставать в очередь, если есть активные комнаты.
    const myRooms = await this.rooms.listMine(userId);
	const hasActive = myRooms.some((r) => r.status !== 'finished');
    if (hasActive) {
      throw new BadRequestException(
        'You already have active rooms. Leave them first.',
      );
    }

    const now = Date.now();
    const entry: QueueEntry = {
      userId,
      username,
      packId,
      deckId,
      deckCards,
      queuedAt: now,
    };

    await this.redis
      .multi()
      .setex(
        ENTRY_PREFIX + userId,
        ENTRY_TTL_SECONDS,
        JSON.stringify(entry),
      )
      .zadd(QUEUE_PREFIX + packId, now, userId)
      .exec();

    return this.status(userId);
  }

  async dequeue(userId: string): Promise<void> {
    const entry = await this.getEntry(userId);
    await this.redis
      .multi()
      .del(ENTRY_PREFIX + userId)
      .zrem(QUEUE_PREFIX + (entry?.packId ?? ''), userId)
      .exec();
  }

  async status(userId: string): Promise<MatchmakingStatusDto> {
    const entry = await this.getEntry(userId);
    if (!entry) {
      return {
        inQueue: false,
        packId: null,
        queuedAt: null,
        position: null,
        totalInPack: null,
      };
    }

    const queueKey = QUEUE_PREFIX + entry.packId;
    const rank = await this.redis.zrank(queueKey, userId);
    const total = await this.redis.zcard(queueKey);

    return {
      inQueue: true,
      packId: entry.packId,
      queuedAt: entry.queuedAt,
      position: rank !== null ? rank + 1 : null,
      totalInPack: total,
    };
  }

  /**
   * Пытается подобрать пары во всех непустых очередях.
   * Возвращает список готовых матчей — эмитит их вызывающий (socket-io).
   */
  async tryMatch(): Promise<MatchResult[]> {
    const results: MatchResult[] = [];

    // Находим все непустые очереди.
    const keys = await this.redis.keys(QUEUE_PREFIX + '*');
    const packIds = keys.map((k) => k.replace(QUEUE_PREFIX, ''));

    for (const packId of packIds) {
      const queueKey = QUEUE_PREFIX + packId;

      // Пока в очереди есть хотя бы двое — пробуем матчить.
      // Ограничиваем защитным лимитом, чтобы не залипнуть в одном тике.
      for (let iter = 0; iter < 10; iter++) {
        const pair = await this.redis.zrange(queueKey, 0, 1);
        if (pair.length < 2) break;

        const [user1Id, user2Id] = pair;

        // Атомарно убираем обоих из очереди.
        const removed = await this.redis.zrem(queueKey, user1Id, user2Id);
        if (removed < 2) {
          // Кто-то успел уйти — не продолжаем по этой паре.
          continue;
        }

        const [e1, e2] = await Promise.all([
          this.getEntry(user1Id),
          this.getEntry(user2Id),
        ]);

        // Один из entry уже удалён (leave/expire) — просто продолжаем.
        if (!e1 || !e2) {
          // Возвращаем в очередь того, кто ещё актуален.
          if (e1) {
            await this.redis.zadd(queueKey, e1.queuedAt, e1.userId);
          } else if (e2) {
            await this.redis.zadd(queueKey, e2.queuedAt, e2.userId);
          }
          continue;
        }

        try {
          // Создаём комнату «от лица» первого, второго присоединяем.
          const room = await this.rooms.create(e1.userId, e1.username, {
            packId,
            deckP1Id: e1.deckId,
            deckP1Cards: e1.deckCards,
            p1BotName: null,
            allowSpectators: false,
          });

          await this.rooms.join(e2.userId, e2.username, room.code, {
            deckP2Id: e2.deckId,
            deckP2Cards: e2.deckCards,
            p2BotName: null,
          });

          // Удаляем entry, чтобы они не висели.
          await this.redis
            .multi()
            .del(ENTRY_PREFIX + e1.userId)
            .del(ENTRY_PREFIX + e2.userId)
            .exec();

          results.push({
            user1Id: e1.userId,
            user2Id: e2.userId,
            user1Name: e1.username,
            user2Name: e2.username,
            roomCode: room.code,
          });

          this.logger.log(
            `[mm] matched ${e1.userId} vs ${e2.userId} → room ${room.code} (pack ${packId})`,
          );
        } catch (e) {
          this.logger.error(
            `[mm] failed to create room for ${e1.userId}/${e2.userId}: ${e}`,
          );
          // Возвращаем в очередь, чтобы попробовать снова.
          await this.redis
            .multi()
            .zadd(queueKey, e1.queuedAt, e1.userId)
            .zadd(queueKey, e2.queuedAt, e2.userId)
            .exec();
        }
      }
    }

    return results;
  }
  
  /**
   * Для игроков, которые висят в очереди > BOT_FALLBACK_MS и не нашли пару,
   * подбирает бота с ближайшим рейтингом. Возвращает список матчей,
   * которые надо эмитить клиентам.
   */
  async tryFallbackToBot(): Promise<BotMatchResult[]> {
    const results: BotMatchResult[] = [];
    const keys = await this.redis.keys(QUEUE_PREFIX + '*');
    const packIds = keys.map((k) => k.replace(QUEUE_PREFIX, ''));
  
    for (const packId of packIds) {
      const queueKey = QUEUE_PREFIX + packId;
  
      // Берём всю очередь (пакет маленький — ок). Проверяем самого старого.
      const entriesRaw = await this.redis.zrange(queueKey, 0, -1);
      if (entriesRaw.length === 0) continue;
  
      for (const userId of entriesRaw) {
        const entry = await this.getEntry(userId);
        if (!entry) {
          // TTL истёк — вычищаем из очереди.
          await this.redis.zrem(queueKey, userId);
          continue;
        }
  
        const waited = Date.now() - entry.queuedAt;
        if (waited < BOT_FALLBACK_MS) break; // дальше только более свежие
  
        // Окно расширяется со временем ожидания.
        const extra = Math.floor((waited - BOT_FALLBACK_MS) / BOT_WINDOW_STEP_MS) * BOT_WINDOW_STEP;
        const window = Math.min(BOT_WINDOW_INITIAL + extra, BOT_WINDOW_MAX);
  
        // Рейтинг игрока — для подбора ближайшего бота.
        const playerRating = await this.ratings.getOrCreate(entry.userId).catch(() => null);
        const targetRating = playerRating?.rating ?? 1500;
  
        const bot = await this.botRatings.findClosestTo(targetRating, window);
        if (!bot) continue; // нет ботов — ждём дальше
  
        // Атомарно убираем из очереди.
        const removed = await this.redis.zrem(queueKey, userId);
        if (removed === 0) continue; // кто-то другой успел
  
        try {
          const botName = botDisplayName(bot.botId);
          const room = await this.rooms.createWithBot(
            entry.userId,
            entry.username,
            {
              packId,
              deckP1Id: entry.deckId,
              deckP1Cards: entry.deckCards,
              p1BotName: null,
              allowSpectators: false,
            },
            bot.botId,
            botName,
          );
  
          await this.redis.del(ENTRY_PREFIX + entry.userId);
  
          this.logger.log(
            `[mm] bot fallback ${entry.userId} → ${bot.botId} (${bot.rating}, window ${window}) room ${room.code}`,
          );
  
          results.push({
            userId: entry.userId,
            userName: entry.username,
            roomCode: room.code,
            botId: bot.botId,
            botName,
          });
        } catch (e) {
          this.logger.error(`[mm] bot fallback failed for ${entry.userId}: ${e}`);
          // Возвращаем в очередь.
          await this.redis.zadd(queueKey, entry.queuedAt, entry.userId);
        }
      }
    }
  
    return results;
  }

  private async getEntry(userId: string): Promise<QueueEntry | null> {
    const raw = await this.redis.get(ENTRY_PREFIX + userId);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as QueueEntry;
    } catch {
      return null;
    }
  }
}