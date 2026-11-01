import { IsIn, IsInt, IsString, Min } from 'class-validator';
import { RARITIES, Rarity } from '../economy.types';

export class CraftBoosterDto {
  @IsString()
  recipeId!: string;
}

export class CraftCardDto {
  @IsString()
  cardDefId!: string;
}

export class DisenchantDto {
  @IsString()
  cardDefId!: string;

  @IsInt()
  @Min(1)
  count!: number;
}

export class UpgradeCardDto {
  @IsString()
  cardDefId!: string;

  @IsInt()
  @Min(1)
  sacrificeCount!: number;
}

export class ConvertShardsDto {
  @IsString()
  seriesId!: string;

  @IsIn(RARITIES)
  rarity!: Rarity;

  @IsInt()
  @Min(1)
  amount!: number;
}