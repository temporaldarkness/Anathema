import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../common/events.service';
import { tierFor } from '../rating/rating.service';

export interface FriendDto {
  userId: string;
  username: string;
  avatarUrl: string | null;
  rating: number;
  tier: string;
  online?: boolean;
}

export interface FriendRequestDto {
  id: string;
  userId: string;
  username: string;
  avatarUrl: string | null;
  rating: number;
  tier: string;
  createdAt: string;
}

interface Pair {
  userAId: string;
  userBId: string;
}

/** Приводит пару к каноническому виду (a < b). */
function makePair(x: string, y: string): Pair {
  return x < y ? { userAId: x, userBId: y } : { userAId: y, userBId: x };
}

@Injectable()
export class FriendsService {
  private readonly logger = new Logger(FriendsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  async list(userId: string): Promise<FriendDto[]> {
    const rows = await this.prisma.friendship.findMany({
      where: {
        status: 'accepted',
        OR: [{ userAId: userId }, { userBId: userId }],
      },
    });

    const otherIds = rows.map((r) =>
      r.userAId === userId ? r.userBId : r.userAId,
    );
    if (otherIds.length === 0) return [];

    const [profiles, ratings] = await Promise.all([
      this.prisma.userProfile.findMany({
        where: { userId: { in: otherIds } },
        select: { userId: true, username: true, avatarUrl: true },
      }),
      this.prisma.rating.findMany({
        where: { userId: { in: otherIds } },
        select: { userId: true, rating: true },
      }),
    ]);

    const profileById = new Map(profiles.map((p) => [p.userId, p]));
    const ratingById = new Map(ratings.map((r) => [r.userId, r.rating]));

    return otherIds
      .map((id) => {
        const p = profileById.get(id);
        const r = ratingById.get(id) ?? 1500;
        return {
          userId: id,
          username: p?.username ?? 'Аноним',
          avatarUrl: p?.avatarUrl ?? null,
          rating: Math.round(r),
          tier: tierFor(r),
        };
      })
      .sort((a, b) => a.username.localeCompare(b.username));
  }

  async incomingRequests(userId: string): Promise<FriendRequestDto[]> {
    const rows = await this.prisma.friendship.findMany({
      where: {
        status: 'pending',
        requestedById: { not: userId },
        OR: [{ userAId: userId }, { userBId: userId }],
      },
      orderBy: { createdAt: 'desc' },
    });

    return this.enrichRequests(rows, userId, 'requester');
  }

  async outgoingRequests(userId: string): Promise<FriendRequestDto[]> {
    const rows = await this.prisma.friendship.findMany({
      where: {
        status: 'pending',
        requestedById: userId,
      },
      orderBy: { createdAt: 'desc' },
    });

    return this.enrichRequests(rows, userId, 'addressee');
  }

  private async enrichRequests(
    rows: Array<{
      id: string;
      userAId: string;
      userBId: string;
      createdAt: Date;
    }>,
    userId: string,
    side: 'requester' | 'addressee',
  ): Promise<FriendRequestDto[]> {
    const otherIds = rows.map((r) => {
      // Для входящих — нам нужен requester (тот, кто не userId).
      // Для исходящих — addressee (тот, кто не userId).
      // В любом случае — «другая сторона» относительно userId.
      return r.userAId === userId ? r.userBId : r.userAId;
    });

    if (otherIds.length === 0) return [];

    const [profiles, ratings] = await Promise.all([
      this.prisma.userProfile.findMany({
        where: { userId: { in: otherIds } },
        select: { userId: true, username: true, avatarUrl: true },
      }),
      this.prisma.rating.findMany({
        where: { userId: { in: otherIds } },
        select: { userId: true, rating: true },
      }),
    ]);

    const profileById = new Map(profiles.map((p) => [p.userId, p]));
    const ratingById = new Map(ratings.map((r) => [r.userId, r.rating]));

    return rows.map((r) => {
      const otherId = r.userAId === userId ? r.userBId : r.userAId;
      const p = profileById.get(otherId);
      const rating = ratingById.get(otherId) ?? 1500;
      return {
        id: r.id,
        userId: otherId,
        username: p?.username ?? 'Аноним',
        avatarUrl: p?.avatarUrl ?? null,
        rating: Math.round(rating),
        tier: tierFor(rating),
        createdAt: r.createdAt.toISOString(),
      };
    });
  }

  async sendRequest(requesterId: string, targetId: string): Promise<void> {
    if (requesterId === targetId) {
      throw new BadRequestException('Cannot add yourself');
    }

    // Целевой пользователь должен существовать (иметь профиль).
    const target = await this.prisma.userProfile.findUnique({
      where: { userId: targetId },
      select: { userId: true, username: true },
    });
    if (!target) {
      throw new NotFoundException('User not found');
    }

    const { userAId, userBId } = makePair(requesterId, targetId);

    const existing = await this.prisma.friendship.findUnique({
      where: { userAId_userBId: { userAId, userBId } },
    });

    if (existing) {
      if (existing.status === 'accepted') {
        throw new BadRequestException('Already friends');
      }
      if (existing.requestedById === requesterId) {
        throw new BadRequestException('Request already sent');
      }
      // Обратная заявка уже висит — принимаем автоматически.
      await this.acceptRequest(requesterId, existing.id);
      return;
    }

    const created = await this.prisma.friendship.create({
      data: {
        userAId,
        userBId,
        requestedById: requesterId,
        status: 'pending',
      },
    });

    const requesterProfile = await this.prisma.userProfile.findUnique({
      where: { userId: requesterId },
      select: { username: true, avatarUrl: true },
    });

    // Уведомляем получателя.
    this.events.toUser(targetId, 'friend_request_received', {
      requestId: created.id,
      fromUserId: requesterId,
      fromUsername: requesterProfile?.username ?? 'Игрок',
      fromAvatarUrl: requesterProfile?.avatarUrl ?? null,
    });
  }

  async acceptRequest(userId: string, requestId: string): Promise<void> {
    const f = await this.prisma.friendship.findUnique({
      where: { id: requestId },
    });
    if (!f) throw new NotFoundException('Request not found');
    if (f.userAId !== userId && f.userBId !== userId) {
      throw new ForbiddenException('Not your request');
    }
    if (f.requestedById === userId) {
      throw new ForbiddenException('Cannot accept your own request');
    }
    if (f.status !== 'pending') {
      throw new BadRequestException('Request is not pending');
    }

    await this.prisma.friendship.update({
      where: { id: requestId },
      data: { status: 'accepted' },
    });

    // Уведомляем инициатора.
    const accepterProfile = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: { username: true },
    });

    this.events.toUser(f.requestedById, 'friend_request_accepted', {
      byUserId: userId,
      byUsername: accepterProfile?.username ?? 'Игрок',
    });
  }

  async declineRequest(userId: string, requestId: string): Promise<void> {
    const f = await this.prisma.friendship.findUnique({
      where: { id: requestId },
    });
    if (!f) throw new NotFoundException('Request not found');
    if (f.userAId !== userId && f.userBId !== userId) {
      throw new ForbiddenException('Not your request');
    }
    if (f.requestedById === userId) {
      throw new ForbiddenException('Cannot decline your own request');
    }
    await this.prisma.friendship.delete({ where: { id: requestId } });
  }

  async cancelOutgoing(userId: string, requestId: string): Promise<void> {
    const f = await this.prisma.friendship.findUnique({
      where: { id: requestId },
    });
    if (!f) throw new NotFoundException('Request not found');
    if (f.requestedById !== userId) {
      throw new ForbiddenException('Not your request');
    }
    await this.prisma.friendship.delete({ where: { id: requestId } });
  }

  async removeFriend(userId: string, friendId: string): Promise<void> {
    const { userAId, userBId } = makePair(userId, friendId);
    const f = await this.prisma.friendship.findUnique({
      where: { userAId_userBId: { userAId, userBId } },
    });
    if (!f || f.status !== 'accepted') {
      throw new NotFoundException('Friendship not found');
    }
    await this.prisma.friendship.delete({ where: { id: f.id } });

    this.events.toUser(friendId, 'friend_removed', {
      byUserId: userId,
    });
  }

  /** Для экрана чужого профиля: статус связи. */
  async relationStatus(
    userId: string,
    targetId: string,
  ): Promise<
    | { kind: 'self' }
    | { kind: 'none' }
    | { kind: 'friends'; requestId: string }
    | { kind: 'incoming'; requestId: string }
    | { kind: 'outgoing'; requestId: string }
  > {
    if (userId === targetId) return { kind: 'self' };
    const { userAId, userBId } = makePair(userId, targetId);
    const f = await this.prisma.friendship.findUnique({
      where: { userAId_userBId: { userAId, userBId } },
    });
    if (!f) return { kind: 'none' };
    if (f.status === 'accepted') {
      return { kind: 'friends', requestId: f.id };
    }
    // pending
    if (f.requestedById === userId) {
      return { kind: 'outgoing', requestId: f.id };
    }
    return { kind: 'incoming', requestId: f.id };
  }
}