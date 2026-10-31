import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
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

const MAX_CARD_SNAPSHOT_BYTES = 512 * 1024;
const MAX_DECOMPRESSED_CARD_SNAPSHOT_BYTES = 2 * 1024 * 1024;
const COMPRESS_THRESHOLD_BYTES = 512;

interface ServerGzipMarker {
  __gz: string;
  __gzAlg: 'gzip';
  __gzV: 1;
}

function isServerSnapshotMarker(value: unknown): boolean {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    ('__gz' in (value as Record<string, unknown>) ||
      '__gzAlg' in (value as Record<string, unknown>) ||
      '__gzV' in (value as Record<string, unknown>))
  );
}

function compressCardSnapshot(serialized: string): ServerGzipMarker | null {
  if (Buffer.byteLength(serialized, 'utf8') <= COMPRESS_THRESHOLD_BYTES) {
    return null;
  }
  return {
    __gz: gzipSync(Buffer.from(serialized, 'utf8'), { level: 9 }).toString('base64'),
    __gzAlg: 'gzip',
    __gzV: 1,
  };
}

@Injectable()
export class MatchesService {
  private readonly logger = new Logger(MatchesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private decompressCardSnapshot(raw: unknown): unknown {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
    const obj = raw as Record<string, unknown>;
    if (typeof obj.__gz !== 'string') return raw;
    if (obj.__gzAlg !== 'gzip' || obj.__gzV !== 1) {
      this.logger.warn('Unsupported cardSnapshot compression marker');
      return null;
    }
    try {
      const decompressed = gunzipSync(Buffer.from(obj.__gz, 'base64'), {
        maxOutputLength: MAX_DECOMPRESSED_CARD_SNAPSHOT_BYTES,
      }).toString('utf8');
      return JSON.parse(decompressed);
    } catch (e) {
      this.logger.warn(`Failed to decompress cardSnapshot: ${String(e)}`);
      return null;
    }
  }

  async save(
    userId: string,
    username: string,
    dto: SaveMatchDto,
  ): Promise<MatchSummaryDto> {
    if (isServerSnapshotMarker(dto.cardSnapshot)) {
      throw new BadRequestException('Invalid cardSnapshot');
    }
    let snapshotToStore: Prisma.InputJsonValue | typeof Prisma.JsonNull =
      Prisma.JsonNull;
    if (dto.cardSnapshot) {
      const serialized = JSON.stringify(dto.cardSnapshot);
      if (Buffer.byteLength(serialized, 'utf8') > MAX_CARD_SNAPSHOT_BYTES) {
        throw new BadRequestException('cardSnapshot too large');
      }
      const compressed = compressCardSnapshot(serialized);
      snapshotToStore = (compressed ??
        dto.cardSnapshot) as Prisma.InputJsonValue;
    }

    const match = await this.prisma.match.create({
       data: {
        player1Id: dto.player1Id ?? userId,
        player2Id: dto.player2Id ?? null,
        player1Name: dto.player1Name,
        player2Name: dto.player2Name,
        winnerId: dto.winnerId,
        winnerReason: dto.winnerReason,
        series: dto.series,
        cardSnapshot: snapshotToStore,
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
      cardSnapshot: this.decompressCardSnapshot(m.cardSnapshot) as Record<string, unknown> | null,
      commands: m.commands.map((c: any): CommandRecord => ({
        sequence: c.sequence,
        playerId: c.playerId,
        command: c.command,
      })),
    };
  }
}