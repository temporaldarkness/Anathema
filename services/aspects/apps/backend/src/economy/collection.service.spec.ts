import { CollectionService } from './collection.service';

describe('CollectionService', () => {
  let service: CollectionService;
  let prisma: any;
  let economy: any;
  let catalog: any;

  beforeEach(() => {
    prisma = {
      userCollection: {
        findUnique: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    economy = { modifyShards: jest.fn() };
    catalog = { getById: jest.fn() };
    service = new CollectionService(prisma, economy, catalog);
  });

  describe('validateDeckOwnership', () => {
    it('PvE режим всегда возвращает true', async () => {
      const result = await service.validateDeckOwnership('u1', ['card1'], true);
      expect(result).toEqual({ valid: true, missingCards: [] });
    });

    it('PvP учитывает количество копий', async () => {
      prisma.userCollection.findMany.mockResolvedValue([
        { cardDefId: 'card1', count: 1 },
      ]);

      const result = await service.validateDeckOwnership('u1', ['card1', 'card1', 'card2'], false);
      expect(result.valid).toBe(false);
      expect(result.missingCards).toContain('card1'); // Нужно 2, а есть 1
      expect(result.missingCards).toContain('card2'); // Нет вообще
    });
  });

  describe('disenchantCard', () => {
    it('разбирает карту и начисляет правильные осколки', async () => {
      catalog.getById.mockReturnValue({ rarity: 'COMMON', primarySeries: 'classic' });
      prisma.userCollection.findUnique.mockResolvedValue({ count: 2 });
      prisma.userCollection.update.mockResolvedValue({});

      await service.disenchantCard('u1', 'card1', 1);

      expect(economy.modifyShards).toHaveBeenCalledWith(
        'u1',
        [
          { shardType: 'SERIES', seriesId: 'classic', rarity: 'COMMON', delta: 1 },
          // Для COMMON universal = 0, поэтому он отфильтровывается
        ],
        'DISENCHANT',
        expect.any(Object)
      );
      expect(prisma.userCollection.update).toHaveBeenCalledWith({
        where: { userId_cardDefId: { userId: 'u1', cardDefId: 'card1' } },
        data: { count: { decrement: 1 } },
      });
    });
  });
});