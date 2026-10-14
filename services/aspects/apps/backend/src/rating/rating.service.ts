import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  RATING_DEFAULTS,
  updatePair,
  roundRating,
  type Rating,
} from './glicko2';

export interface PublicRating {
  rating: number;
  rd: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  tier: string;
}

export interface PublicRatingHistoryEntry {
  id: string;
  playedAt: string;
  opponentId: string;
  opponentName: string;
  result: 'win' | 'loss' | 'draw';
  ratingBefore: number;
  ratingAfter: number;
  delta: number;
}

export function tierFor(rating: number): string {
  if (rating < 1100) return 'Новичок';
  if (rating < 1300) return 'Ученик';
  if (rating < 1500) return 'Любитель';
  if (rating < 1700) return 'Опытный';
  if (rating < 1900) return 'Ветеран';
  if (rating < 2100) return 'Мастер';
  return 'Гроссмейстер';
}

/** Пропускаем рейтинг для анонимов и ботов. */
function isRated(id: string): boolean {
  return !!id && !id.startsWith('anon:') && !id.startsWith('bot:');
}

@Injectable()
export class RatingService {
  private readonly logger = new Logger(RatingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getOrCreate(userId: string): Promise<Rating> {
    const existing = await this.prisma.rating.findUnique({
      where: { userId },
    });
    if (existing) {
      return {
        rating: existing.rating,
        rd: existing.rd,
        volatility: existing.volatility,
      };
    }
    const created = await this.prisma.rating.create({
      data: {
        userId,
        rating: RATING_DEFAULTS.rating,
        rd: RATING_DEFAULTS.rd,
        volatility: RATING_DEFAULTS.volatility,
      },
    });
    return {
      rating: created.rating,
      rd: created.rd,
      volatility: created.volatility,
    };
  }

  async getPublic(userId: string): Promise<PublicRating> {
    const r = await this.getOrCreate(userId);
    const db = await this.prisma.rating.findUnique({
      where: { userId },
      select: { matchesPlayed: true, wins: true, losses: true },
    });
    return {
      rating: roundRating(r.rating),
      rd: Math.round(r.rd),
      matchesPlayed: db?.matchesPlayed ?? 0,
      wins: db?.wins ?? 0,
      losses: db?.losses ?? 0,
      tier: tierFor(r.rating),
    };
  }
  async getBotRatings(): Promise<
    Array<{
      botId: string;
      rating: number;
      rd: number;
      matchesPlayed: number;
      wins: number;
      losses: number;
    }>
  > {
    const rows = await this.prisma.botRating.findMany({
      orderBy: [{ rating: 'desc' }, { matchesPlayed: 'desc' }],
    });
    return rows.map((r) => ({
      botId: r.botId,
      rating: Math.round(r.rating),
      rd: Math.round(r.rd),
      matchesPlayed: r.matchesPlayed,
      wins: r.wins,
      losses: r.losses,
    }));
  }

  async getHistory(
    userId: string,
    limit = 20,
  ): Promise<PublicRatingHistoryEntry[]> {
    const rows = await this.prisma.ratingHistory.findMany({
      where: { userId },
      orderBy: { playedAt: 'desc' },
      take: Math.max(1, Math.min(100, limit)),
    });
    return rows.map((r) => ({
      id: String(r.id),
      playedAt: r.playedAt.toISOString(),
      opponentId: r.opponentId,
      opponentName: r.opponentName,
      result: r.result as 'win' | 'loss' | 'draw',
      ratingBefore: roundRating(r.ratingBefore),
      ratingAfter: roundRating(r.ratingAfter),
      delta: Math.round(r.delta),
    }));
  }

  async applyMatch(
    winner: { id: string; name: string },
    loser: { id: string; name: string },
    matchId?: string,
  ): Promise<
    | {
        winnerDelta: string;
        loserDelta: string;
        winnerAfter: number;
        loserAfter: number;
      }
    | null
  > {
    const winnerRated = isRated(winner.id);
    const loserRated = isRated(loser.id);
    if (!winnerRated || !loserRated) return null;

    const [wBefore, lBefore] = await Promise.all([
      this.getOrCreate(winner.id),
      this.getOrCreate(loser.id),
    ]);

    const { p1: wAfter, p2: lAfter } = updatePair(wBefore, lBefore, 'p1_win');

    const wDelta = wAfter.rating - wBefore.rating;
    const lDelta = lAfter.rating - lBefore.rating;

    await this.prisma.$transaction([
      this.prisma.rating.upsert({
        where: { userId: winner.id },
        create: {
          userId: winner.id,
          rating: wAfter.rating,
          rd: wAfter.rd,
          volatility: wAfter.volatility,
          matchesPlayed: 1,
          wins: 1,
          losses: 0,
          lastPlayedAt: new Date(),
        },
        update: {
          rating: wAfter.rating,
          rd: wAfter.rd,
          volatility: wAfter.volatility,
          matchesPlayed: { increment: 1 },
          wins: { increment: 1 },
          lastPlayedAt: new Date(),
        },
      }),
      this.prisma.rating.upsert({
        where: { userId: loser.id },
        create: {
          userId: loser.id,
          rating: lAfter.rating,
          rd: lAfter.rd,
          volatility: lAfter.volatility,
          matchesPlayed: 1,
          wins: 0,
          losses: 1,
          lastPlayedAt: new Date(),
        },
        update: {
          rating: lAfter.rating,
          rd: lAfter.rd,
          volatility: lAfter.volatility,
          matchesPlayed: { increment: 1 },
          losses: { increment: 1 },
          lastPlayedAt: new Date(),
        },
      }),
      this.prisma.ratingHistory.create({
        data: {
          userId: winner.id,
          matchId: matchId ?? null,
          opponentId: loser.id,
          opponentName: loser.name,
          result: 'win',
          ratingBefore: wBefore.rating,
          ratingAfter: wAfter.rating,
          delta: wDelta,
          rdBefore: wBefore.rd,
          rdAfter: wAfter.rd,
        },
      }),
      this.prisma.ratingHistory.create({
        data: {
          userId: loser.id,
          matchId: matchId ?? null,
          opponentId: winner.id,
          opponentName: winner.name,
          result: 'loss',
          ratingBefore: lBefore.rating,
          ratingAfter: lAfter.rating,
          delta: lDelta,
          rdBefore: lBefore.rd,
          rdAfter: lAfter.rd,
        },
      }),
    ]);

    const fmt = (d: number) => (d >= 0 ? `+${Math.round(d)}` : `${Math.round(d)}`);

    return {
      winnerDelta: fmt(wDelta),
      loserDelta: fmt(lDelta),
      winnerAfter: roundRating(wAfter.rating),
      loserAfter: roundRating(lAfter.rating),
    };
  }
}