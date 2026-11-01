import { useEffect, useState } from 'react';
import { allCardsById } from '@aspects/cards';
import type { CraftBoosterResponse } from '../../game/economyApi';
import { RARITY_COLOR } from '../../game/abilityText';

interface Props {
  result: CraftBoosterResponse;
  onClose: () => void;
}

export function PackOpeningOverlay({ result, onClose }: Props) {
  const [revealedCount, setRevealedCount] = useState(0);
  const allCards = allCardsById();

  useEffect(() => {
    if (revealedCount < result.cards.length) {
      const timer = setTimeout(() => setRevealedCount(prev => prev + 1), 500);
      return () => clearTimeout(timer);
    }
  }, [revealedCount, result.cards.length]);

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.85)', zIndex: 10000,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
    }}>
      <h1 style={{ color: 'white', marginBottom: 40 }}>✨ Ваши карты ✨</h1>
      
      <div style={{ display: 'flex', gap: 20, perspective: 1000 }}>
        {result.cards.map((c, i) => {
          const isRevealed = i < revealedCount;
          const isNew = result.newBlueprints.includes(c.id);
          const def = allCards[c.id];
          
          if (!isRevealed) {
            return <div key={i} style={{ width: 160, height: 240, background: '#333', borderRadius: 12, border: '2px solid #555' }} />;
          }

          return (
            <div key={i} style={{
              width: 160, height: 240, background: '#1a1a1a',
              borderRadius: 12, border: `3px solid ${isNew ? '#fbbf24' : RARITY_COLOR[def?.rarity || 'common']}`,
              padding: 12, display: 'flex', flexDirection: 'column', alignItems: 'center',
              animation: 'fadeIn 0.5s ease-out',
              boxShadow: isNew ? '0 0 20px #fbbf24' : 'none',
              position: 'relative'
            }}>
              {isNew && <div style={{ position: 'absolute', top: -10, background: '#fbbf24', color: 'black', fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 'bold' }}>НОВАЯ</div>}
              
              <div style={{ fontSize: '14px', fontWeight: 'bold', textAlign: 'center', marginTop: 20 }}>{def?.name}</div>
              <div style={{ fontSize: '12px', color: '#888', marginTop: 4 }}>{def?.personalityTag}</div>
              
              <div style={{ marginTop: 'auto', fontSize: '12px', color: '#666' }}>
                {isNew ? 'Чертёж открыт' : 'Дубликат'}
              </div>
            </div>
          );
        })}
      </div>

      {revealedCount >= result.cards.length && (
        <button 
          className="btn-primary" 
          onClick={onClose}
          style={{ marginTop: 50, padding: '12px 40px', fontSize: '18px' }}
        >
          Забрать
        </button>
      )}
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(20px) scale(0.9); } to { opacity: 1; transform: translateY(0) scale(1); } }`}</style>
    </div>
  );
}