import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { gzipSync, gunzipSync } from 'node:zlib';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type {
  SaveMatchDto,
  MatchSummaryDto,
  MatchDetailDto,
  CommandRecord,
} from '@aspects/shared';
import { Prisma } from '../generated/prisma/client';

const GZ_PREFIX = '__gz:';

function compressCardSnapshot(
  snapshot: Record<string, unknown> | null | undefined,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (!snapshot) return Prisma.JsonNull;
  const json = JSON.stringify(snapshot);
  const gz = gzipSync(Buffer.from(json, 'utf8'), { level: 9 }).toString(
    'base64',
  );
  return { [GZ_PREFIX.slice(1, -1) + '_v1']: gz } as Prisma.InputJsonValue;
}

function decompressCardSnapshot(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(gunzipSync(Buffer.from(raw, 'base64')).toString('utf8'));
    } catch {
      return null;
    }
  }
  if (typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const key = Object.keys(obj).find((k) => k.startsWith('__gz'));
  if (key && typeof obj[key] === 'string') {
    try {
      return JSON.parse(
        gunzipSync(Buffer.from(obj[key] as string, 'base64')).toString('utf8'),
      );
    } catch {
      return null;
    }
  }
  return obj;
}

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
        player1Id: dto.player1Id ?? userId,
        player2Id: dto.player2Id ?? null,
        player1Name: dto.player1Name,
        player2Name: dto.player2Name,
        winnerId: dto.winnerId,
        winnerReason: dto.winnerReason,
        series: dto.series,
        cardSnapshot: compressCardSnapshot(dto.cardSnapshot),
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
      cardSnapshot: decompressCardSnapshot(m.cardSnapshot),
      commands: m.commands.map((c: any): CommandRecord => ({
        sequence: c.sequence,
        playerId: c.playerId,
        command: c.command,
      })),
    };
  }
}