import { Module } from '@nestjs/common';
import { CardsCatalogService } from './cards-catalog.service';
import { CollectionService } from './collection.service';
import { CraftingService } from './crafting.service';
import { EconomyController } from './economy.controller';
import { EconomyService } from './economy.service';
import { RewardsService } from './rewards.service';

@Module({
  controllers: [EconomyController],
  providers: [
    EconomyService,
    CardsCatalogService,
    CollectionService,
    CraftingService,
    RewardsService,
  ],
  exports: [
    EconomyService,
    CollectionService,
    CraftingService,
    RewardsService,
  ],
})
export class EconomyModule {}