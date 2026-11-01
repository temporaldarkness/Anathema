import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { CollectionService } from './collection.service';
import { CraftingService } from './crafting.service';
import { EconomyService } from './economy.service';
import {
  ConvertShardsDto,
  CraftBoosterDto,
  CraftCardDto,
  DisenchantDto,
  UpgradeCardDto,
} from './dto/economy.dto';

@Controller('economy')
export class EconomyController {
  constructor(
    private readonly economy: EconomyService,
    private readonly crafting: CraftingService,
    private readonly collection: CollectionService,
  ) {}

  @Get('balance')
  getBalance(@Req() req: any) {
    return this.economy.getBalance(this.userId(req));
  }

  @Get('collection')
  getCollection(@Req() req: any) {
    return this.collection.getCollection(this.userId(req));
  }

  @Get('recipes')
  getRecipes() {
    return this.crafting.getActiveRecipes();
  }

  @Post('craft-booster')
  craftBooster(@Req() req: any, @Body() dto: CraftBoosterDto) {
    return this.crafting.craftBooster(this.userId(req), dto.recipeId);
  }

  @Post('craft-card')
  craftCard(@Req() req: any, @Body() dto: CraftCardDto) {
    return this.crafting.craftCard(this.userId(req), dto.cardDefId);
  }

  @Post('disenchant')
  disenchant(@Req() req: any, @Body() dto: DisenchantDto) {
    return this.collection.disenchantCard(
      this.userId(req),
      dto.cardDefId,
      dto.count,
    );
  }

  @Post('upgrade-card')
  upgradeCard(@Req() req: any, @Body() dto: UpgradeCardDto) {
    return this.collection.upgradeCard(
      this.userId(req),
      dto.cardDefId,
      dto.sacrificeCount,
    );
  }

  @Post('convert-shards')
  convertShards(@Req() req: any, @Body() dto: ConvertShardsDto) {
    return this.economy.convertToUniversal(
      this.userId(req),
      dto.seriesId,
      dto.rarity,
      dto.amount,
    );
  }

  private userId(req: any): string {
    return req.user.id;
  }
}