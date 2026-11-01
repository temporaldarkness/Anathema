import { useCallback, useEffect, useState } from 'react';
import { economyApi, type ShardBalanceDto, type OwnedCardDto, type BoosterRecipeDto } from './economyApi';

export function useEconomy() {
  const [balance, setBalance] = useState<ShardBalanceDto[]>([]);
  const [collection, setCollection] = useState<OwnedCardDto[]>([]);
  const [recipes, setRecipes] = useState<BoosterRecipeDto[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [b, c, r] = await Promise.all([
        economyApi.getBalance(),
        economyApi.getCollection(),
        economyApi.getRecipes(),
      ]);
      setBalance(b);
      setCollection(c);
      setRecipes(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
      setInitialized(true);
    }
  }, []);

  // Загружаем только при первом обращении к хуку
  useEffect(() => {
    if (!initialized) {
      refetch();
    }
  }, [initialized, refetch]);

  const getShardAmount = useCallback((type: 'SERIES'|'UNIVERSAL', rarity: string, seriesId?: string) => {
    // Приводим rarity к UPPERCASE для сравнения с бэкендом
    const targetRarity = rarity.toUpperCase();
    const found = balance.find(b => 
      b.shardType === type && 
      b.rarity === targetRarity && 
      (type === 'UNIVERSAL' || b.seriesId === seriesId)
    );
    return found?.amount ?? 0;
  }, [balance]);

  const getOwnedCard = useCallback((cardDefId: string) => {
    return collection.find(c => c.cardDefId === cardDefId);
  }, [collection]);

  const hasBlueprint = useCallback((cardDefId: string) => {
    return getOwnedCard(cardDefId)?.hasBlueprint ?? false;
  }, [getOwnedCard]);

  return {
    balance,
    collection,
    recipes,
    loading,
    error,
    refetch,
    getShardAmount,
    getOwnedCard,
    hasBlueprint,
  };
}