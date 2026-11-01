import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  CardsCatalogService,
  EconomyCardDefinition,
} from './cards-catalog.service';
import { EconomyService } from './economy.service';
import {
  CARD_CRAFT_COST,
  RARITIES,
  Rarity,
  RequiredShard,
} from './economy.types';

export interface CraftBoosterResult {
  cards: EconomyCardDefinition[];
  newBlueprints: string[];
}

@Injectable()
export class CraftingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly economy: EconomyService,
    private readonly catalog: CardsCatalogService,
  ) {}

  async getActiveRecipes() {
    const now = new Date();
    return this.prisma.boosterRecipe.findMany({
      where: {
        activeFrom: { lte: now },
        OR: [{ activeUntil: null }, { activeUntil: { gte: now } }],
      },
      orderBy: { activeFrom: 'desc' },
    });
  }

  async craftBooster(
    userId: string,
    recipeId: string,
  ): Promise<CraftBoosterResult> {
    const recipe = await this.prisma.boosterRecipe.findUnique({
      where: { id: recipeId },
    });
    if (!recipe) throw new NotFoundException('Рецепт бустера не найден');

    const now = new Date();
    if (
      recipe.activeFrom > now ||
      (recipe.activeUntil && recipe.activeUntil < now)
    ) {
      throw new BadRequestException('Рецепт неактивен');
    }

    const required = recipe.requiredShards as unknown as RequiredShard[];
    const balance = await this.economy.getBalance(userId);
    const balanceMap = new Map(
      balance.map((row) => [
        this.balanceKey(row.shardType, row.seriesId, row.rarity),
        row.amount,
      ]),
    );

    const spendChanges = required.map((req) => {
      const seriesId = req.type === 'UNIVERSAL' ? null : req.series ?? null;
      const key = this.balanceKey(req.type, seriesId, req.rarity);
      const have = balanceMap.get(key) ?? 0;
      if (have < req.amount) {
        throw new BadRequestException(
          `Недостаточно осколков для рецепта: ${req.type}/${seriesId ?? 'UNIVERSAL'}/${req.rarity}`,
        );
      }
      return {
        shardType: req.type,
        seriesId,
        rarity: req.rarity,
        delta: -req.amount,
      };
    });

    await this.economy.modifyShards(
      userId,
      spendChanges,
      'CRAFT_BOOSTER',
      { recipeId },
    );

    const pool = this.catalog.getBySeries(recipe.poolSeries);
    if (pool.length === 0) {
      throw new BadRequestException('Пустой пул карт для рецепта');
    }

    const weights = recipe.dropWeights as Record<string, number>;
    const cards = Array.from({ length: recipe.cardsPerPack }, () =>
      this.pickCard(pool, weights),
    );

    const newBlueprints = new Set<string>();

    await this.prisma.$transaction(async (tx) => {
      for (const card of cards) {
        const existing = await tx.userCollection.findUnique({
          where: { userId_cardDefId: { userId, cardDefId: card.id } },
        });

        if (!existing) {
          await tx.userCollection.create({
            data: {
              userId,
              cardDefId: card.id,
              count: 1,
              hasBlueprint: true,
            },
          });
          newBlueprints.add(card.id);
        } else {
          await tx.userCollection.update({
            where: { userId_cardDefId: { userId, cardDefId: card.id } },
            data: {
              count: { increment: 1 },
              ...(existing.hasBlueprint ? {} : { hasBlueprint: true }),
            },
          });
          if (!existing.hasBlueprint) newBlueprints.add(card.id);
        }
      }
    });

    return { cards, newBlueprints: [...newBlueprints] };
  }

  async craftCard(userId: string, cardDefId: string): Promise<void> {
    const card = this.catalog.getById(cardDefId);
    if (!card) throw new NotFoundException('Карта не найдена');

    const entry = await this.prisma.userCollection.findUnique({
      where: { userId_cardDefId: { userId, cardDefId } },
    });
    if (!entry?.hasBlueprint) {
      throw new ForbiddenException('Нет чертежа для крафта карты');
    }

    const cost = CARD_CRAFT_COST[card.rarity];
    if (!cost) throw new BadRequestException('Неизвестная редкость карты');

    await this.economy.modifyShards(
      userId,
      [
        {
          shardType: 'SERIES',
          seriesId: card.primarySeries,
          rarity: card.rarity,
          delta: -cost,
        },
      ],
      'CRAFT_CARD',
      {
        cardDefId,
        rarity: card.rarity,
        series: card.primarySeries,
        cost,
      },
    );

    await this.prisma.userCollection.upsert({
      where: { userId_cardDefId: { userId, cardDefId } },
      update: { count: { increment: 1 } },
      create: { userId, cardDefId, count: 1, hasBlueprint: true },
    });
  }

  private pickCard(
    pool: EconomyCardDefinition[],
    weights: Record<string, number>,
  ): EconomyCardDefinition {
    const weightOf = (r: Rarity): number =>
      Math.max(0, weights[r] ?? weights[r.toLowerCase()] ?? 0);

    const total = RARITIES.reduce((sum, r) => sum + weightOf(r), 0);
    if (total <= 0) throw new BadRequestException('Некорректные dropWeights');

    let roll = (randomInt(0, 1_000_000) / 1_000_000) * total;
    let chosen: Rarity = RARITIES[0];
    for (const r of RARITIES) {
      roll -= weightOf(r);
      if (roll <= 0) {
        chosen = r;
        break;
      }
    }

    const candidates = pool.filter((c) => c.rarity === chosen);
    const fallback = candidates.length > 0 ? candidates : pool;
    return fallback[randomInt(0, fallback.length)];
  }

  private balanceKey(
    shardType: string,
    seriesId: string | null | undefined,
    rarity: string,
  ): string {
    return `${shardType}|${seriesId ?? ''}|${rarity}`;
  }
}