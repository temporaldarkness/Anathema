import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type {
  SaveMatchDto,
  MatchSummaryDto,
  MatchDetailDto,
  CommandRecord,
} from '@aspects/shared';
import { Prisma } from '../generated/prisma/client';

export const INTERNAL_CALLER_PREFIX = 'internal:';

@Injectable()
export class MatchesService {
  private readonly logger = new Logger(MatchesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async save(
    userId: string,
    username: string,
    dto: SaveMatchDto,
  ): Promise<MatchSummaryDto> {
    if (userId.startsWith(INTERNAL_CALLER_PREFIX)) {
      throw new ForbiddenException('Reserved caller id');
    }
    return this.saveInternal(userId, username, dto, false);
  }

  async saveFromServer(
    authorUserId: string,
    authorUsername: string,
    dto: SaveMatchDto,
  ): Promise<MatchSummaryDto> {
    if (!authorUserId.startsWith(INTERNAL_CALLER_PREFIX)) {
      throw new ForbiddenException('saveFromServer is server-only');
    }
    return this.saveInternal(authorUserId, authorUsername, dto, true);
  }

  private async saveInternal(
    userId: string,
    username: string,
    dto: SaveMatchDto,
    isInternal: boolean,
  ): Promise<MatchSummaryDto> {
    const player1Id = isInternal ? (dto.player1Id ?? userId) : userId;
    const player2Id = isInternal
      ? (dto.player2Id ?? null)
      : dto.player2Id && dto.player2Id !== userId
        ? dto.player2Id
        : null;

    const p1ForDb = player1Id && !player1Id.startsWith('anon:') ? player1Id : null;
    const p2ForDb = player2Id && !player2Id.startsWith('anon:') ? player2Id : null;

    if (isInternal && p1ForDb !== userId && p2ForDb !== userId) {
      throw new ForbiddenException(
        'Server match author must be one of the players',
      );
    }

    if (dto.winnerId !== null && dto.winnerId !== 'p1' && dto.winnerId !== 'p2') {
      throw new BadRequestException('winnerId must be "p1", "p2" or null');
    }
    if (dto.winnerId === 'p2' && !isInternal && !p2ForDb) {
      throw new BadRequestException(
        'winnerId "p2" requires a second identified player',
      );
    }
    const commands = dto.commands
      .filter((c) => c.playerId === 'p1' || c.playerId === 'p2')
      .map((c, i) => ({
        sequence: i,
        playerId: c.playerId,
        command: c.command as Prisma.InputJsonValue,
      }));
    const match = await this.prisma.match.create({
      data: {
        player1Id: p1ForDb,
        player2Id: p2ForDb,
        player1Name: dto.player1Name,
        player2Name: dto.player2Name,
        winnerId: dto.winnerId,
        winnerReason: dto.winnerReason,
        series: dto.series,
        cardSnapshot: dto.cardSnapshot
          ? (dto.cardSnapshot as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        seed: dto.seed,
        turnNumber: dto.turnNumber,
        durationMs: dto.durationMs,
        p1BotName: dto.p1BotName,
        p2BotName: dto.p2BotName,
        endedAt: new Date(),
        decks: {
          create: [
            { player: 1, cardIds: dto.deckP1 },
            { player: 2, cardIds: dto.deckP2 },
          ],
        },
      },
    });

    const BATCH_SIZE = 500;
    for (let i = 0; i < commands.length; i += BATCH_SIZE) {
      const batch = commands.slice(i, i + BATCH_SIZE);
      await this.prisma.matchCommand.createMany({
        data: batch.map((c) => ({ ...c, matchId: match.id })),
      });
    }

    await this.audit.log({
      user_id: userId,
      username,
      action: 'save_match',
      entity_type: 'match',
      entity_id: match.id,
      details: {
        winnerId: dto.winnerId,
        turnNumber: dto.turnNumber,
        commandsCount: commands.length,
      },
    });

    return this.toSummary(match);
  }

  async list(userId: string): Promise<MatchSummaryDto[]> {
    const matches = await this.prisma.match.findMany({
      where: {
        OR: [{ player1Id: userId }, { player2Id: userId }],
      },
      orderBy: { startedAt: 'desc' },
      take: 100,
    });
    return matches.map((m) => this.toSummary(m));
  }

  async get(userId: string, matchId: string): Promise<MatchDetailDto> {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        decks: true,
        commands: { orderBy: { sequence: 'asc' } },
      },
    });
    if (!match) throw new NotFoundException('Match not found');
    if (
      match.player1Id &&
      match.player1Id !== userId &&
      match.player2Id !== userId
    ) {
      throw new ForbiddenException('Not your match');
    }
    return this.toDetail(match);
  }

  private toSummary(m: any): MatchSummaryDto {
    return {
      id: m.id,
      player1Name: m.player1Name,
      player2Name: m.player2Name,
      player1Id: m.player1Id,
      player2Id: m.player2Id,
      winnerId: m.winnerId,
      winnerReason: m.winnerReason,
          series: m.series,
      turnNumber: m.turnNumber,
      durationMs: m.durationMs,
      p1BotName: m.p1BotName,
      p2BotName: m.p2BotName,
      startedAt: m.startedAt.toISOString(),
      endedAt: m.endedAt ? m.endedAt.toISOString() : null,
    };
  }

  private toDetail(m: any): MatchDetailDto {
    const deckP1 = m.decks.find((d: any) => d.player === 1)?.cardIds ?? [];
    const deckP2 = m.decks.find((d: any) => d.player === 2)?.cardIds ?? [];
    return {
      ...this.toSummary(m),
      seed: m.seed,
      deckP1,
      deckP2,
          cardSnapshot: m.cardSnapshot,
      commands: m.commands.map((c: any): CommandRecord => ({
        sequence: c.sequence,
        playerId: c.playerId,
        command: c.command,
      })),
    };
  }
}