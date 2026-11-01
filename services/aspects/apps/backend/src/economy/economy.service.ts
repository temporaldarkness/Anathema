import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CONVERT_RATE,
  NormalizedShardChange,
  ShardChange,
} from './economy.types';

@Injectable()
export class EconomyService {
  constructor(private readonly prisma: PrismaService) {}

  async modifyShards(
    userId: string,
    changes: ShardChange[],
    transactionType: string,
    details?: Record<string, unknown>,
  ): Promise<void> {
    const normalized = this.aggregate(changes);

    await this.prisma.$transaction(async (tx) => {
      for (const change of normalized) {
        if (change.delta === 0) continue;

        if (change.delta < 0) {
          const result = await tx.shardBalance.updateMany({
            where: {
              userId,
              shardType: change.shardType,
              seriesId: change.seriesId,
              rarity: change.rarity,
              amount: { gte: -change.delta },
            },
            data: {
              amount: { increment: change.delta },
            },
          });

          if (result.count === 0) {
            throw new BadRequestException(
              `Недостаточно осколков: ${change.shardType}/${change.seriesId || 'UNIVERSAL'}/${change.rarity}`,
            );
          }
        } else {
          await tx.shardBalance.upsert({
            where: {
              userId_shardType_seriesId_rarity: {
                userId,
                shardType: change.shardType,
                seriesId: change.seriesId,
                rarity: change.rarity,
              },
            },
            update: {
              amount: { increment: change.delta },
            },
            create: {
              userId,
              shardType: change.shardType,
              seriesId: change.seriesId,
              rarity: change.rarity,
              amount: change.delta,
            },
          });
        }
      }

      await tx.economyTransaction.create({
        data: {
          userId,
          type: transactionType,
          details: (details ?? { changes: normalized }) as any,
        },
      });
    });
  }

  async getBalance(userId: string) {
    const rows = await this.prisma.shardBalance.findMany({
      where: { userId },
      orderBy: [{ shardType: 'asc' }, { seriesId: 'asc' }, { rarity: 'asc' }],
    });

    return rows.map((row) => ({
      ...row,
      seriesId: row.seriesId === '' ? null : row.seriesId,
    }));
  }

  async convertToUniversal(
    userId: string,
    seriesId: string,
    rarity: string,
    amount: number,
  ): Promise<void> {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new BadRequestException('amount должен быть положительным целым');
    }
    if (amount % CONVERT_RATE !== 0) {
      throw new BadRequestException(
        `amount должен быть кратен ${CONVERT_RATE}`,
      );
    }

    const universalAmount = amount / CONVERT_RATE;

    await this.modifyShards(
      userId,
      [
        {
          shardType: 'SERIES',
          seriesId,
          rarity: rarity as any,
          delta: -amount,
        },
        {
          shardType: 'UNIVERSAL',
          seriesId: null,
          rarity: rarity as any,
          delta: universalAmount,
        },
      ],
      'CONVERT_SHARD',
      { seriesId, rarity, amount, universalAmount, rate: CONVERT_RATE },
    );
  }

  async logTransaction(
    userId: string,
    type: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.economyTransaction.create({
      data: { userId, type, details: details as any },
    });
  }

  private aggregate(changes: ShardChange[]): NormalizedShardChange[] {
    const map = new Map<string, NormalizedShardChange>();

    for (const change of changes) {
      if (!Number.isInteger(change.delta)) {
        throw new BadRequestException('delta должен быть целым числом');
      }

      const seriesId =
        change.shardType === 'UNIVERSAL' ? '' : change.seriesId ?? '';

      if (change.shardType === 'SERIES' && !seriesId) {
        throw new BadRequestException('Для SERIES обязательно нужен seriesId');
      }

      const key = `${change.shardType}|${seriesId}|${change.rarity}`;
      const existing = map.get(key);

      if (existing) {
        existing.delta += change.delta;
      } else {
        map.set(key, {
          shardType: change.shardType,
          seriesId,
          rarity: change.rarity,
          delta: change.delta,
        });
      }
    }

    return [...map.values()].filter((change) => change.delta !== 0);
  }
}