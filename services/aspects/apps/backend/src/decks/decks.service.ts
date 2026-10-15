import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  validateDeck,
  errorText,
  type CreateDeckDto,
  type DeckDto,
} from '@aspects/shared';
import { getPack, type CardDefinition } from '@aspects/cards';

@Injectable()
export class DecksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(userId: string): Promise<DeckDto[]> {
    const decks = await this.prisma.deck.findMany({
      where: { ownerId: userId },
      include: { cards: true },
      orderBy: { updatedAt: 'desc' },
    });

    return decks.map((d) => this.toDto(d));
  }

  async create(
    userId: string,
    username: string,
    dto: CreateDeckDto,
  ): Promise<DeckDto> {
    const { pool } = this.buildPool(dto.series);

    const validation = validateDeck(dto.cardIds, pool, dto.series);
    if (!validation.valid) {
      throw new BadRequestException(
        validation.errors.map(errorText).join('; '),
      );
    }

    await this.ensureUser(userId, username);

    const counts = this.countCards(dto.cardIds);

    const deck = await this.prisma.deck.create({
      data: {
        ownerId: userId,
        name: dto.name,
        description: dto.description ?? '',
        series: dto.series,
        cards: {
          create: [...counts.entries()].map(([cardId, count]) => ({
            cardId,
            count,
          })),
        },
      },
      include: { cards: true },
    });

    await this.audit.log({
      user_id: userId,
      username,
      action: 'create_deck',
      entity_type: 'deck',
      entity_id: deck.id,
      details: { name: dto.name, size: dto.cardIds.length, series: dto.series },
    });

    return this.toDto(deck);
  }

  async update(
    userId: string,
    username: string,
    deckId: string,
    dto: CreateDeckDto,
  ): Promise<DeckDto> {
    const existing = await this.prisma.deck.findUnique({
      where: { id: deckId },
    });
    if (!existing) throw new NotFoundException('Deck not found');
    if (existing.ownerId !== userId)
      throw new ForbiddenException('Not your deck');

    const { pool } = this.buildPool(dto.series);

    const validation = validateDeck(dto.cardIds, pool, dto.series);
    if (!validation.valid) {
      throw new BadRequestException(
        validation.errors.map(errorText).join('; '),
      );
    }

    const counts = this.countCards(dto.cardIds);

    const deck = await this.prisma.$transaction(async (tx) => {
      await tx.deckCard.deleteMany({ where: { deckId } });
      return tx.deck.update({
        where: { id: deckId },
        data: {
          name: dto.name,
          description: dto.description ?? existing.description,
          series: dto.series,
          cards: {
            create: [...counts.entries()].map(([cardId, count]) => ({
              cardId,
              count,
            })),
          },
        },
        include: { cards: true },
      });
    });

    await this.audit.log({
      user_id: userId,
      username,
      action: 'update_deck',
      entity_type: 'deck',
      entity_id: deck.id,
      details: { name: dto.name, size: dto.cardIds.length, series: dto.series },
    });

    return this.toDto(deck);
  }

  async remove(
    userId: string,
    username: string,
    deckId: string,
  ): Promise<void> {
    const existing = await this.prisma.deck.findUnique({
      where: { id: deckId },
    });
    if (!existing) throw new NotFoundException('Deck not found');
    if (existing.ownerId !== userId)
      throw new ForbiddenException('Not your deck');

    await this.prisma.deck.delete({ where: { id: deckId } });

    await this.audit.log({
      user_id: userId,
      username,
      action: 'delete_deck',
      entity_type: 'deck',
      entity_id: deckId,
      details: { name: existing.name },
    });
  }

  private buildPool(series: string[]): {
    pool: CardDefinition[];
  } {
    const merged = new Map<string, CardDefinition>();

    for (const s of series) {
      let pack;
      try {
        pack = getPack(s);
      } catch {
        throw new BadRequestException(`Неизвестная серия: ${s}`);
      }
      for (const c of pack.cards) {
        if (!merged.has(c.id)) merged.set(c.id, c);
      }
    }

    if (merged.size === 0) {
      throw new BadRequestException('Не найдено ни одной карты в сериях');
    }

    return { pool: [...merged.values()] };
  }

  private countCards(cardIds: string[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const id of cardIds) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }

  private async ensureUser(userId: string, username: string): Promise<void> {
    await this.prisma.user.upsert({
      where: { id: userId },
      update: { username },
      create: { id: userId, username },
    });
  }

  private toDto(deck: {
    id: string;
    ownerId: string;
    name: string;
    description: string;
    series: string[];
    cards: { cardId: string; count: number }[];
    createdAt: Date;
    updatedAt: Date;
  }): DeckDto {
    const cardIds: string[] = [];
    for (const dc of deck.cards) {
      for (let i = 0; i < dc.count; i++) cardIds.push(dc.cardId);
    }
    const series = deck.series
    return {
      id: deck.id,
      ownerId: deck.ownerId,
      name: deck.name,
      description: deck.description ?? '',
      series,
      cardIds,
      createdAt: deck.createdAt.toISOString(),
      updatedAt: deck.updatedAt.toISOString(),
    };
  }
}