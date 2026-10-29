import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RatingService, tierFor } from '../rating/rating.service';

export interface PublicUserDto {
  id: string;
  username: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  rating: number;
  tier: string;
  rd: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rating: RatingService,
  ) {}

  
  async search(query: string, limit = 20) {
    const q = query.trim();
    if (q.length < 2) return [];
  
    const profiles = await this.prisma.userProfile.findMany({
      where: {
        username: { contains: q, mode: 'insensitive' },
      },
      orderBy: { username: 'asc' },
      take: Math.max(1, Math.min(50, limit)),
      select: {
        userId: true,
        username: true,
        avatarUrl: true,
        isAdmin: true,
      },
    });
  
    const ids = profiles.map((p) => p.userId);
    const ratings = ids.length
      ? await this.prisma.rating.findMany({
          where: { userId: { in: ids } },
          select: {
            userId: true,
            rating: true,
            rd: true,
            matchesPlayed: true,
            wins: true,
            losses: true,
          },
        })
      : [];
    const byId = new Map(ratings.map((r) => [r.userId, r]));
  
    return profiles.map((p) => {
      const r = byId.get(p.userId);
      const rating = r?.rating ?? 1500;
      return {
        userId: p.userId,
        username: p.username,
        avatarUrl: p.avatarUrl,
        isAdmin: p.isAdmin,
        rating: Math.round(rating),
        rd: Math.round(r?.rd ?? 350),
        matchesPlayed: r?.matchesPlayed ?? 0,
        wins: r?.wins ?? 0,
        losses: r?.losses ?? 0,
        tier: tierFor(rating),
      };
    });
  }
  
  async getLeaderboard(limit = 100) {
    const take = Math.max(1, Math.min(200, limit));
  
    const ratings = await this.prisma.rating.findMany({
      where: { matchesPlayed: { gt: 0 } },
      orderBy: [{ rating: 'desc' }, { matchesPlayed: 'desc' }],
      take,
      select: {
        userId: true,
        rating: true,
        rd: true,
        matchesPlayed: true,
        wins: true,
        losses: true,
      },
    });
  
    const ids = ratings.map((r) => r.userId);
    if (ids.length === 0) return [];
  
    const profiles = await this.prisma.userProfile.findMany({
      where: { userId: { in: ids } },
      select: {
        userId: true,
        username: true,
        avatarUrl: true,
        isAdmin: true,
      },
    });
    const byId = new Map(profiles.map((p) => [p.userId, p]));
  
    return ratings.map((r, idx) => {
      const p = byId.get(r.userId);
      return {
        rank: idx + 1,
        userId: r.userId,
        username: p?.username ?? 'Аноним',
        avatarUrl: p?.avatarUrl ?? null,
        isAdmin: p?.isAdmin ?? false,
        rating: Math.round(r.rating),
        rd: Math.round(r.rd),
        matchesPlayed: r.matchesPlayed,
        wins: r.wins,
        losses: r.losses,
        tier: tierFor(r.rating),
      };
    });
  }
  async upsertFromSession(
    userId: string,
    username: string,
  ): Promise<void> {
    if (!userId || userId.startsWith('anon:')) return;
    if (!username) return;
    try {
      await this.prisma.userProfile.upsert({
        where: { userId },
        create: { userId, username },
        update: { username },
      });
    } catch (e) {
      console.warn(`[users] profile cache upsert failed for ${userId}:`, e);
    }
  }
  
  async getProfileSnapshot(userId: string): Promise<{
    isAdmin: boolean;
	avatarUrl: string | null;
  } | null> {
	const profile = await this.prisma.userProfile.findUnique({
	  where: { userId },
	  select: { isAdmin: true, avatarUrl: true },
	});
	return profile;
  }

  async getPublic(userId: string): Promise<PublicUserDto | null> {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
    });
    const rating = await this.rating.getPublic(userId);

    return {
      id: userId,
      username: profile?.username ?? 'Игрок',
      avatarUrl: profile?.avatarUrl ?? null,
      isAdmin: profile?.isAdmin ?? false,
      rating: rating.rating,
      tier: rating.tier,
      rd: rating.rd,
      matchesPlayed: rating.matchesPlayed,
      wins: rating.wins,
      losses: rating.losses,
    };
  }
}