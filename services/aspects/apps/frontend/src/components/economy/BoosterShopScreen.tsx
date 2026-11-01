import { useState } from 'react';
import type { useEconomy } from '../../game/useEconomy';
import { economyApi } from '../../game/economyApi';
import { ShardBalanceBar } from './ShardBalanceBar';
import { PackOpeningOverlay } from './PackOpeningOverlay';
import { RARITY_COLOR, RARITY_TEXT } from '../../game/abilityText';

interface Props {
  economyStore: ReturnType<typeof useEconomy>;
  onBack: () => void;
}

export function BoosterShopScreen({ economyStore, onBack }: Props) {
  const { balance, recipes, refetch, getShardAmount } = economyStore;
  const [opening, setOpening] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleBuy = async (recipeId: string) => {
    try {
      setOpening(true);
      const res = await economyApi.craftBooster(recipeId);
      setResult(res);
      await refetch();
    } catch (e) {
      alert('Ошибка: ' + (e as Error).message);
      setOpening(false);
    }
  };

  return (
    <div className="page-screen" style={{ overflowY: 'auto', height: '100vh' }}>
      <div className="page-card" style={{ maxWidth: 1000, margin: '0 auto', width: '100%' }}>
        <header style={{ display: 'flex', alignItems: 'center', marginBottom: 20, gap: 16 }}>
          <button className="btn-header" onClick={onBack}>← Назад</button>
          <h1 style={{ margin: 0, fontSize: '24px' }}>🎁 Магазин бустеров</h1>
        </header>

        <ShardBalanceBar balance={balance} />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20, marginTop: 20 }}>
          {recipes.map(recipe => {
            // Проверяем, хватает ли ресурсов
            const canAfford = recipe.requiredShards.every(req => 
              getShardAmount(req.type, req.rarity, req.series) >= req.amount
            );

            return (
              <div key={recipe.id} style={{
                background: '#222', border: '1px solid #444', borderRadius: 12, padding: 20,
                display: 'flex', flexDirection: 'column', gap: 12
              }}>
                <h2 style={{ margin: 0 }}>{recipe.name}</h2>
                <p style={{ margin: 0, color: '#aaa', fontSize: '14px' }}>{recipe.description}</p>
                
                <div style={{ marginTop: 'auto' }}>
                  <div style={{ fontSize: '12px', color: '#888', marginBottom: 4 }}>Стоимость:</div>
                  {recipe.requiredShards.map((req, i) => {
                    const have = getShardAmount(req.type, req.rarity, req.series);
                    const isEnough = have >= req.amount;
                    return (
                      <div key={i} style={{ color: isEnough ? '#22c55e' : '#ef4444', fontSize: '14px' }}>
                        {req.amount} шт. {RARITY_TEXT[req.rarity.toLowerCase()]} ({req.type === 'UNIVERSAL' ? 'Универсальные' : req.series})
                        <span style={{ marginLeft: 8, color: '#666' }}>(у вас: {have})</span>
                      </div>
                    );
                  })}
                </div>

                <button
                  className="btn-primary"
                  disabled={!canAfford || opening}
                  onClick={() => handleBuy(recipe.id)}
                  style={{ padding: '10px', fontSize: '16px', marginTop: 8 }}
                >
                  {opening ? 'Открытие...' : 'Купить и открыть'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {result && (
        <PackOpeningOverlay 
          result={result} 
          onClose={() => {
            setResult(null);
            setOpening(false);
          }} 
        />
      )}
    </div>
  );
}