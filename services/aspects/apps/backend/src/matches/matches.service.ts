import {
  ForbiddenException,
  Injectable,
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

@Injectable()
export class MatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async save(
    userId: string,
    username: string,
    dto: SaveMatchDto,
  ): Promise<MatchSummaryDto> {
    const match = await this.prisma.match.create({
      data: {
        player1Id: userId,
        player2Id: null,
        player1Name: dto.player1Name,
        player2Name: dto.player2Name,
        winnerId: dto.winnerId,
        winnerReason: dto.winnerReason,
        packId: dto.packId,
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
        commands: {
          create: dto.commands.map((c) => ({
            sequence: c.sequence,
            playerId: c.playerId,
            command: c.command as any,
          })),
        },
      },
    });

    await this.audit.log({
      user_id: userId,
      username,
      action: 'save_match',
      entity_type: 'match',
      entity_id: match.id,
      details: {
        winnerId: dto.winnerId,
        turnNumber: dto.turnNumber,
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
      packId: m.packId,
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
      commands: m.commands.map((c: any): CommandRecord => ({
        sequence: c.sequence,
        playerId: c.playerId,
        command: c.command,
      })),
    };
  }
}