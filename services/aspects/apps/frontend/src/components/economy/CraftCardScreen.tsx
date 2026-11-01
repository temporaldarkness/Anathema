import { useState, useMemo } from 'react';
import { allCardsById, getPersonalityName, getSeriesName } from '@aspects/cards';
import type { useEconomy } from '../../game/useEconomy';
import { economyApi } from '../../game/economyApi';
import { RARITY_COLOR, RARITY_TEXT } from '../../game/abilityText';

interface Props {
  economyStore: ReturnType<typeof useEconomy>;
  initialCardId?: string;
  onBack: () => void;
}

const CARD_CRAFT_COST: Record<string, number> = {
  common: 10,
  uncommon: 25,
  rare: 60,
  epic: 150,
  legendary: 400,
};

export function CraftCardScreen({ economyStore, initialCardId, onBack }: Props) {
  const { getShardAmount, hasBlueprint, refetch } = economyStore;
  const [loading, setLoading] = useState(false);

  const card = useMemo(() => {
    if (!initialCardId) return null;
    return allCardsById()[initialCardId] || null;
  }, [initialCardId]);

  if (!card) {
    return (
      <div className="page-screen" style={{ padding: 40, textAlign: 'center' }}>
        <h1>Карта не найдена</h1>
        <button className="btn-header" onClick={onBack}>← Назад</button>
      </div>
    );
  }

  const primarySeries = card.series?.[0] ?? 'classic';
  const rarity = card.rarity || 'common';
  const cost = CARD_CRAFT_COST[rarity] || 0;
  
  const userHasBlueprint = hasBlueprint(card.id);
  const currentShards = getShardAmount('SERIES', rarity, primarySeries);
  const canAfford = currentShards >= cost;

  const handleCraft = async () => {
    try {
      setLoading(true);
      await economyApi.craftCard(card.id);
      await refetch();
      alert('Карта успешно скрафчена!');
      onBack();
    } catch (e) {
      alert('Ошибка: ' + (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-screen" style={{ overflowY: 'auto', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="page-card" style={{ maxWidth: 500, width: '100%', textAlign: 'center' }}>
        <button className="btn-header" onClick={onBack} style={{ alignSelf: 'flex-start', marginBottom: 20 }}>← Назад</button>
        
        <h2 style={{ marginTop: 0 }}>🔨 Крафт карты</h2>
        
        <div style={{ 
          margin: '20px auto', width: 240, padding: 20, borderRadius: 12,
          background: '#1a1a1a', border: `3px solid ${RARITY_COLOR[rarity]}`
        }}>
          <h3 style={{ margin: 0, fontSize: 20 }}>{card.name}</h3>
          <div style={{ color: '#888', fontSize: 14, marginTop: 4 }}>{getPersonalityName(card.personalityTag)}</div>
          <div style={{ marginTop: 16, fontSize: 14 }}>
            <div>Редкость: <b style={{ color: RARITY_COLOR[rarity] }}>{RARITY_TEXT[rarity]}</b></div>
            <div>Серия: <b>{getSeriesName(primarySeries)}</b></div>
          </div>
        </div>

        {!userHasBlueprint ? (
          <div style={{ color: '#ef4444', background: 'rgba(239,68,68,0.1)', padding: 12, borderRadius: 8, marginBottom: 20 }}>
            ❌ У вас нет чертежа этой карты. Её нужно сначала получить из бустера.
          </div>
        ) : (
          <>
            <div style={{ background: 'rgba(255,255,255,0.05)', padding: 16, borderRadius: 8, marginBottom: 20 }}>
              <div>Стоимость крафта:</div>
              <div style={{ fontSize: 18, fontWeight: 'bold', marginTop: 8, color: canAfford ? '#22c55e' : '#ef4444' }}>
                {cost} серийных осколков ({RARITY_TEXT[rarity]})
              </div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                У вас есть: {currentShards}
              </div>
            </div>

            <button 
              className="btn-primary" 
              onClick={handleCraft} 
              disabled={!canAfford || loading}
              style={{ width: '100%', padding: 12, fontSize: 16 }}
            >
              {loading ? 'Создание...' : 'Скрафтить карту'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}