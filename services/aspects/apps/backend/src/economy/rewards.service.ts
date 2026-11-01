import { Injectable } from '@nestjs/common';
import { EconomyService } from './economy.service';
import { ShardChange } from './economy.types';

@Injectable()
export class RewardsService {
  constructor(private readonly economy: EconomyService) {}

  async grantMatchReward(
    userId: string,
    matchResult: { winner: boolean; turns: number; isPve: boolean },
  ): Promise<void> {
    const multiplier = matchResult.isPve ? 0.5 : 1;

    const base = Math.floor(10 * multiplier);
    const winCommon = matchResult.winner ? Math.floor(15 * multiplier) : 0;
    const winUncommon = matchResult.winner ? Math.floor(5 * multiplier) : 0;

    const changes: ShardChange[] = [
      {
        shardType: 'UNIVERSAL' as const,
        seriesId: null,
        rarity: 'COMMON',
        delta: base + winCommon,
      },
    ];

    if (winUncommon > 0) {
      changes.push({
        shardType: 'UNIVERSAL' as const,
        seriesId: null,
        rarity: 'UNCOMMON',
        delta: winUncommon,
      });
    }

    await this.economy.modifyShards(
      userId,
      changes,
      'REWARD_MATCH',
      {
        winner: matchResult.winner,
        turns: matchResult.turns,
        isPve: matchResult.isPve,
        multiplier,
      },
    );
  }
}