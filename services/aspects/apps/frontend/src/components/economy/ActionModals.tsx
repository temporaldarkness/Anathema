import { useState } from 'react';
import { economyApi } from '../../game/economyApi';
import { RARITY_TEXT } from '../../game/abilityText';
import { listPacks } from '@aspects/cards';

const overlayStyle = { position: 'fixed' as const, top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' };
const modalStyle = { background: '#222', padding: 24, borderRadius: 12, width: 400, border: '1px solid #444', color: 'white' };

export function DisenchantModal({ 
  cardDefId, cardName, rarity, series, maxCount, onClose, onSuccess 
}: { 
  cardDefId: string, cardName: string, rarity: string, series: string, maxCount: number, onClose: () => void, onSuccess: () => void 
}) {
  const [count, setCount] = useState(1);
  const [loading, setLoading] = useState(false);

  // Таблица наград из бэкенда
  const REWARDS: Record<string, { s: number, u: number }> = {
    common: { s: 1, u: 0 },
    uncommon: { s: 2, u: 1 },
    rare: { s: 5, u: 1 },
    epic: { s: 12, u: 2 },
    legendary: { s: 25, u: 3 },
  };
  const reward = REWARDS[rarity.toLowerCase()] || { s: 0, u: 0 };

  const handleDisenchant = async () => {
    try {
      setLoading(true);
      await economyApi.disenchant(cardDefId, count);
      alert(`Успешно разобрано! Получено: ${reward.s * count} серийных и ${reward.u * count} универсальных осколков.`);
      onSuccess();
      onClose();
    } catch (e) {
      alert('Ошибка: ' + (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        <h3 style={{ marginTop: 0, color: '#ef4444' }}>♻ Разобрать карту</h3>
        <p>Вы хотите разобрать <b>{cardName}</b>?</p>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0' }}>
          <span>Количество:</span>
          <input 
            type="number" 
            min={1} 
            max={maxCount} 
            value={count} 
            onChange={e => setCount(Math.min(maxCount, Math.max(1, Number(e.target.value))))} 
            style={{ width: 60, padding: 4, background: '#111', color: 'white', border: '1px solid #444' }} 
          />
          <span style={{ color: '#888' }}>(макс. {maxCount})</span>
        </div>

        {/* ПРЕДУПРЕЖДЕНИЕ О ПОСЛЕДНЕЙ КОПИИ */}
        {count === maxCount && maxCount === 1 && (
          <div style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.1)', padding: 8, borderRadius: 4, fontSize: 12, marginBottom: 12 }}>
            ⚠️ Это ваша последняя копия. Вы не сможете играть этой картой, пока не скрафтите её снова (чертёж останется у вас).
          </div>
        )}

        <div style={{ background: 'rgba(0,0,0,0.3)', padding: 12, borderRadius: 8, marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: '#aaa', marginBottom: 8 }}>Вы получите:</div>
          <div style={{ color: '#38bdf8' }}>📦 {reward.s * count} серийных ({RARITY_TEXT[rarity]})</div>
          {reward.u > 0 && <div style={{ color: '#a78bfa', marginTop: 4 }}>🌌 {reward.u * count} универсальных</div>}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button className="btn-header" onClick={onClose}>Отмена</button>
          <button className="btn-primary" onClick={handleDisenchant} disabled={loading} style={{ background: '#ef4444', borderColor: '#ef4444' }}>
            Разобрать
          </button>
        </div>
      </div>
    </div>
  );
}

export function UpgradeModal({ cardDefId, cardName, currentLevel, maxCount, onClose, onSuccess }: { cardDefId: string, cardName: string, currentLevel: number, maxCount: number, onClose: () => void, onSuccess: () => void }) {
  const [count, setCount] = useState(1);
  const [loading, setLoading] = useState(false);

  const handleUpgrade = async () => {
    try {
      setLoading(true);
      await economyApi.upgradeCard(cardDefId, count);
      onSuccess();
      onClose();
    } catch (e) {
      alert('Ошибка: ' + (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        <h3 style={{ marginTop: 0, color: '#f59e0b' }}>⬆ Улучшить карту</h3>
        <p>Улучшить <b>{cardName}</b> с +{currentLevel} до +{currentLevel + 1}?</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0' }}>
          <span>Пожертвовать копий:</span>
          <input type="number" min={1} max={maxCount} value={count} onChange={e => setCount(Math.min(maxCount, Math.max(1, Number(e.target.value))))} style={{ width: 60, padding: 4, background: '#111', color: 'white', border: '1px solid #444' }} />
          <span style={{ color: '#888' }}>(макс. {maxCount})</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button className="btn-header" onClick={onClose}>Отмена</button>
          <button className="btn-primary" onClick={handleUpgrade} disabled={loading} style={{ background: '#f59e0b', borderColor: '#f59e0b', color: '#000' }}>Улучшить</button>
        </div>
      </div>
    </div>
  );
}

export function ConvertShardsModal({ onClose, onSuccess }: { onClose: () => void, onSuccess: () => void }) {
  const [series, setSeries] = useState('classic');
  const [rarity, setRarity] = useState('common');
  const [amount, setAmount] = useState(10);
  const [loading, setLoading] = useState(false);

  const packs = listPacks();
  const rarities = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

  const handleConvert = async () => {
    if (amount < 2 || amount % 2 !== 0) {
      alert('Количество должно быть четным и не менее 2.');
      return;
    }
    try {
      setLoading(true);
      await economyApi.convertShards(series, rarity.toUpperCase(), amount);
      onSuccess();
      onClose();
    } catch (e) {
      alert('Ошибка: ' + (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        <h3 style={{ marginTop: 0, color: '#38bdf8' }}>⚙ Конвертация осколков</h3>
        <p style={{ color: '#888', fontSize: 13 }}>Обменивайте серийные осколки на универсальные по курсу 2:1.</p>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, margin: '20px 0' }}>
          <select value={series} onChange={e => setSeries(e.target.value)} style={{ padding: 8, background: '#111', color: 'white', border: '1px solid #444', borderRadius: 4 }}>
            {packs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          
          <select value={rarity} onChange={e => setRarity(e.target.value)} style={{ padding: 8, background: '#111', color: 'white', border: '1px solid #444', borderRadius: 4 }}>
            {rarities.map(r => <option key={r} value={r}>{RARITY_TEXT[r]}</option>)}
          </select>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>Кол-во серийных:</span>
            <input type="number" step={2} min={2} value={amount} onChange={e => setAmount(Number(e.target.value))} style={{ width: 80, padding: 8, background: '#111', color: 'white', border: '1px solid #444', borderRadius: 4 }} />
          </div>
		  <div style={{ fontSize: 14, color: '#22c55e', marginTop: 4 }}>
            Вы получите: {amount / 2} универсальных осколков.
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button className="btn-header" onClick={onClose}>Отмена</button>
          <button className="btn-primary" onClick={handleConvert} disabled={loading}>Конвертировать</button>
        </div>
      </div>
    </div>
  );
}