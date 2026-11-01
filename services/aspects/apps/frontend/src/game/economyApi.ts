import type { CardDefinition } from '@aspects/cards';

const API_BASE = '/games/aspects/api/economy';

export interface ShardBalanceDto {
  shardType: 'SERIES' | 'UNIVERSAL';
  seriesId: string | null;
  rarity: string; // 'COMMON' | ...
  amount: number;
}

export interface OwnedCardDto {
  cardDefId: string;
  count: number;
  hasBlueprint: boolean;
  upgradeLevel: number;
}

export interface BoosterRecipeDto {
  id: string;
  name: string;
  description?: string;
  requiredShards: Array<{
    type: 'SERIES' | 'UNIVERSAL';
    series?: string;
    rarity: string;
    amount: number;
  }>;
  dropWeights: Record<string, number>;
  poolSeries: string[];
  cardsPerPack: number;
}

export interface CraftBoosterResponse {
  cards: Array<{ id: string; rarity: string; primarySeries: string; raw: CardDefinition }>;
  newBlueprints: string[];
  duplicates: string[];
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers ?? {}),
    },
    ...opts,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    try {
      const json = JSON.parse(text);
      throw new Error(json.message || `HTTP ${res.status}`);
    } catch {
      throw new Error(text || `HTTP ${res.status}`);
    }
  }

  const text = await res.text();
  if (!text) {
    return undefined as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch (e) {
    console.warn('Не удалось распарсить JSON:', text);
    return undefined as T;
  }
}

export const economyApi = {
  getBalance: () => request<ShardBalanceDto[]>('/balance'),
  getCollection: () => request<OwnedCardDto[]>('/collection'),
  getRecipes: () => request<BoosterRecipeDto[]>('/recipes'),
  
  craftBooster: (recipeId: string) => 
    request<CraftBoosterResponse>('/craft-booster', {
      method: 'POST',
      body: JSON.stringify({ recipeId }),
    }),
    
  craftCard: (cardDefId: string) => 
    request<void>('/craft-card', {
      method: 'POST',
      body: JSON.stringify({ cardDefId }),
    }),
    
  disenchant: (cardDefId: string, count: number) => 
    request<void>('/disenchant', {
      method: 'POST',
      body: JSON.stringify({ cardDefId, count }),
    }),
    
  upgradeCard: (cardDefId: string, sacrificeCount: number) => 
    request<void>('/upgrade-card', {
      method: 'POST',
      body: JSON.stringify({ cardDefId, sacrificeCount }),
    }),
    
  convertShards: (seriesId: string, rarity: string, amount: number) => 
    request<void>('/convert-shards', {
      method: 'POST',
      body: JSON.stringify({ seriesId, rarity, amount }),
    }),
};