import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CardsCatalogService } from './cards-catalog.service';
import { EconomyService } from './economy.service';
import {
  DISENCHANT_TABLE,
  MAX_UPGRADE_LEVEL,
  ShardChange,
} from './economy.types';

@Injectable()
export class CollectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly economy: EconomyService,
    private readonly catalog: CardsCatalogService,
  ) {}

  async getCollection(userId: string) {
    return this.prisma.userCollection.findMany({
      where: { userId },
      orderBy: { cardDefId: 'asc' },
    });
  }

  async disenchantCard(
    userId: string,
    cardDefId: string,
    count: number,
  ): Promise<void> {
    if (!Number.isInteger(count) || count <= 0) {
      throw new BadRequestException('count должен быть положительным целым');
    }

    const card = this.catalog.getById(cardDefId);
    if (!card) throw new NotFoundException('Карта не найдена');

    const entry = await this.prisma.userCollection.findUnique({
      where: { userId_cardDefId: { userId, cardDefId } },
    });
    if (!entry || entry.count < count) {
      throw new BadRequestException('Недостаточно копий карты для разбора');
    }

    const reward = DISENCHANT_TABLE[card.rarity];
    if (!reward) throw new BadRequestException('Неизвестная редкость карты');

    const changes: ShardChange[] = [
      {
        shardType: 'SERIES' as const,
        seriesId: card.primarySeries,
        rarity: card.rarity,
        delta: reward.series,
      },
      {
        shardType: 'UNIVERSAL' as const,
        seriesId: null,
        rarity: card.rarity,
        delta: reward.universal,
      },
    ].filter((c) => c.delta > 0);

    await this.economy.modifyShards(
      userId,
      changes,
      'DISENCHANT',
      {
        cardDefId,
        count,
        rarity: card.rarity,
        series: card.primarySeries,
        reward,
      },
    );

    await this.prisma.userCollection.update({
      where: { userId_cardDefId: { userId, cardDefId } },
      data: { count: { decrement: count } },
    });
  }

  async upgradeCard(
    userId: string,
    cardDefId: string,
    sacrificeCount: number,
  ): Promise<void> {
    if (!Number.isInteger(sacrificeCount) || sacrificeCount <= 0) {
      throw new BadRequestException(
        'sacrificeCount должен быть положительным целым',
      );
    }

    const entry = await this.prisma.userCollection.findUnique({
      where: { userId_cardDefId: { userId, cardDefId } },
    });
    if (!entry) throw new NotFoundException('Карта не найдена в коллекции');
    if (entry.upgradeLevel >= MAX_UPGRADE_LEVEL) {
      throw new BadRequestException('Достигнут максимальный уровень улучшения');
    }
    if (entry.count < sacrificeCount + 1) {
      throw new BadRequestException(
        'Недостаточно копий: нужна основная карта + жертвы',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userCollection.update({
        where: { userId_cardDefId: { userId, cardDefId } },
        data: {
          count: { decrement: sacrificeCount },
          upgradeLevel: { increment: 1 },
        },
      });
      await tx.economyTransaction.create({
        data: {
          userId,
          type: 'UPGRADE',
          details: {
            cardDefId,
            sacrificeCount,
            newUpgradeLevel: entry.upgradeLevel + 1,
          } as any,
        },
      });
    });
  }

  async validateDeckOwnership(
    userId: string,
    cardIds: string[],
    isPve: boolean,
  ): Promise<{ valid: boolean; missingCards: string[] }> {
    if (isPve) return { valid: true, missingCards: [] };

    const required = new Map<string, number>();
    for (const cardId of cardIds) {
      required.set(cardId, (required.get(cardId) ?? 0) + 1);
    }

    const rows = await this.prisma.userCollection.findMany({
      where: { userId, cardDefId: { in: [...required.keys()] } },
    });

    const owned = new Map(rows.map((r) => [r.cardDefId, r.count]));
    const missingCards = [...required.entries()]
      .filter(([id, need]) => (owned.get(id) ?? 0) < need)
      .map(([id]) => id);

    return { valid: missingCards.length === 0, missingCards };
  }
}