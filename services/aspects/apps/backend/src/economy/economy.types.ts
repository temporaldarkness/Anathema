export const RARITIES = [
  'COMMON',
  'UNCOMMON',
  'RARE',
  'EPIC',
  'LEGENDARY',
] as const;

export type Rarity = (typeof RARITIES)[number];
export type ShardType = 'SERIES' | 'UNIVERSAL';

export interface ShardChange {
  shardType: ShardType;
  seriesId?: string | null;
  rarity: Rarity;
  delta: number;
}

export interface NormalizedShardChange {
  shardType: ShardType;
  seriesId: string;
  rarity: Rarity;
  delta: number;
}

export interface RequiredShard {
  type: ShardType;
  series?: string;
  rarity: Rarity;
  amount: number;
}

export const CONVERT_RATE = 2;

export const CARD_CRAFT_COST: Record<Rarity, number> = {
  COMMON: 10,
  UNCOMMON: 25,
  RARE: 60,
  EPIC: 150,
  LEGENDARY: 400,
};

export const DISENCHANT_TABLE: Record<
  Rarity,
  { series: number; universal: number }
> = {
  COMMON: { series: 1, universal: 0 },
  UNCOMMON: { series: 2, universal: 1 },
  RARE: { series: 5, universal: 1 },
  EPIC: { series: 12, universal: 2 },
  LEGENDARY: { series: 25, universal: 3 },
};

export const MAX_UPGRADE_LEVEL = 5;