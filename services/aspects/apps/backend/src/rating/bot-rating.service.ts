import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  updatePair,
  RATING_DEFAULTS,
  roundRating,
  type Rating,
} from './glicko2';

export interface PublicBotRating {
  botId: string;
  rating: number;
  rd: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
}

@Injectable()
export class BotRatingService {
  private readonly logger = new Logger(BotRatingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Публичный список всех ботов с их рейтингом, отсортированный. */
  async listAll(): Promise<PublicBotRating[]> {
    const rows = await this.prisma.botRating.findMany({
      orderBy: { rating: 'desc' },
    });
    return rows.map((r) => ({
      botId: r.botId,
      rating: roundRating(r.rating),
      rd: Math.round(r.rd),
      matchesPlayed: r.matchesPlayed,
      wins: r.wins,
      losses: r.losses,
    }));
  }

  /** Для матчмейкинга: вернуть бота с ближайшим рейтингом в заданном окне. */
  async findClosestTo(
    targetRating: number,
    window: number,
  ): Promise<PublicBotRating | null> {
    const rows = await this.prisma.botRating.findMany({
      where: {
        rating: {
          gte: targetRating - window,
          lte: targetRating + window,
        },
      },
    });
    if (rows.length === 0) return null;
    rows.sort(
      (a, b) => Math.abs(a.rating - targetRating) - Math.abs(b.rating - targetRating),
    );
    const r = rows[0];
    return {
      botId: r.botId,
      rating: roundRating(r.rating),
      rd: Math.round(r.rd),
      matchesPlayed: r.matchesPlayed,
      wins: r.wins,
      losses: r.losses,
    };
  }

  /** Используется скриптом турнира — батчевый upsert. */
  async bulkUpsert(
    updates: Array<{
      botId: string;
      rating: number;
      rd: number;
      volatility: number;
      matchesPlayed: number;
      wins: number;
      losses: number;
    }>,
  ): Promise<void> {
    // На 36 строк это безопасно делать последовательно, но эффективнее
    // одной транзакцией. Prisma поддерживает $transaction с массивом промисов.
    await this.prisma.$transaction(
      updates.map((u) =>
        this.prisma.botRating.upsert({
          where: { botId: u.botId },
          create: u,
          update: u,
        }),
      ),
    );
  }

  /** Читает текущее состояние (для скрипта). */
  async getRating(botId: string): Promise<Rating> {
    const r = await this.prisma.botRating.findUnique({ where: { botId } });
    if (!r) return { ...RATING_DEFAULTS };
    return { rating: r.rating, rd: r.rd, volatility: r.volatility };
  }
}