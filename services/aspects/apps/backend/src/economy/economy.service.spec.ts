import { BadRequestException } from '@nestjs/common';
import { EconomyService } from './economy.service';

describe('EconomyService', () => {
  let service: EconomyService;
  let tx: any;
  let prisma: any;

  beforeEach(() => {
    tx = {
      shardBalance: {
        updateMany: jest.fn(),
        upsert: jest.fn(),
      },
      economyTransaction: {
        create: jest.fn(),
      },
    };

    prisma = {
      $transaction: jest.fn(async (cb: any) => cb(tx)),
      shardBalance: {
        findMany: jest.fn(),
      },
    };

    service = new EconomyService(prisma);
  });

  describe('modifyShards', () => {
    it('должен успешно начислять осколки', async () => {
      tx.shardBalance.upsert.mockResolvedValue({});
      tx.economyTransaction.create.mockResolvedValue({});

      await service.modifyShards(
        'user-1',
        [{ shardType: 'UNIVERSAL', seriesId: null, rarity: 'COMMON', delta: 10 }],
        'REWARD_MATCH',
      );

      expect(tx.shardBalance.upsert).toHaveBeenCalledTimes(1);
      expect(tx.economyTransaction.create).toHaveBeenCalledTimes(1);
    });

    it('должен выбрасывать ошибку при недостатке осколков', async () => {
      tx.shardBalance.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.modifyShards(
          'user-1',
          [{ shardType: 'SERIES', seriesId: 'classic', rarity: 'COMMON', delta: -10 }],
          'CRAFT_CARD',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(tx.economyTransaction.create).not.toHaveBeenCalled();
    });
  });
});