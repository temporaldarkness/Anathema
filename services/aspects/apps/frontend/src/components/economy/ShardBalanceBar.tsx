import type { ShardBalanceDto } from '../../game/economyApi';
import { RARITY_COLOR, RARITY_TEXT } from '../../game/abilityText';
import { getSeriesName } from '@aspects/cards';

interface Props {
  balance: ShardBalanceDto[];
  onOpenConvert?: () => void;
}

export function ShardBalanceBar({ balance, onOpenConvert }: Props) {
  // Группируем по типу (Серия или Универсальные) -> потом по редкости
  const grouped = new Map<string, Map<string, number>>();
  
  for (const b of balance) {
    const groupKey = b.shardType === 'UNIVERSAL' ? 'Универсальные' : getSeriesName(b.seriesId || 'classic');
    if (!grouped.has(groupKey)) grouped.set(groupKey, new Map());
    
    const raritiesMap = grouped.get(groupKey)!;
    raritiesMap.set(b.rarity.toLowerCase(), (raritiesMap.get(b.rarity.toLowerCase()) ?? 0) + b.amount);
  }

  const raritiesOrder = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

  return (
    <div className="shard-balance-bar" style={{
      display: 'flex', gap: '16px', background: 'rgba(0,0,0,0.2)', padding: '12px 16px', borderRadius: '8px', alignItems: 'center', flexWrap: 'wrap'
    }}>
      <div style={{ fontWeight: 'bold', marginRight: '8px', color: '#ccc' }}>💎 Осколки:</div>
      
      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
        {[...grouped.entries()].map(([groupName, rarities]) => {
          const totalInGroup = [...rarities.values()].reduce((a, b) => a + b, 0);
          if (totalInGroup === 0) return null;

          return (
            <div key={groupName} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: groupName === 'Универсальные' ? '#a78bfa' : '#38bdf8', fontSize: '13px', fontWeight: 'bold' }}>
                {groupName === 'Универсальные' ? '🌌' : '📦'} {groupName}:
              </span>
              <div style={{ display: 'flex', gap: '10px' }}>
                {raritiesOrder.map(rarity => {
                  const amount = rarities.get(rarity) ?? 0;
                  if (amount === 0) return null;
                  return (
                    <div key={rarity} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: '12px' }}>
                      <span style={{ color: RARITY_COLOR[rarity], fontWeight: 'bold' }} title={RARITY_TEXT[rarity]}>
                        {amount}
                      </span>
                      <span style={{ color: '#666', fontSize: '9px', textTransform: 'uppercase' }}>{rarity.slice(0, 3)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {onOpenConvert && (
        <button 
          onClick={onOpenConvert}
          style={{ marginLeft: 'auto', background: 'transparent', border: '1px solid #555', color: '#ccc', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}
        >
          ⚙ Конвертировать
        </button>
      )}
    </div>
  );
}