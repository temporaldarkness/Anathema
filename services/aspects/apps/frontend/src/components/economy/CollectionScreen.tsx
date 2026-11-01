import { useMemo, useState } from 'react';
import { allCardsById, getPersonalityName, getSeriesName, SCOPES } from '@aspects/cards';
import { useEconomy } from '../../game/useEconomy';
import { ShardBalanceBar } from './ShardBalanceBar';
import { RARITY_COLOR } from '../../game/abilityText';
import { DisenchantModal, UpgradeModal, ConvertShardsModal } from './ActionModals';

interface Props {
  economyStore: ReturnType<typeof useEconomy>;
  onBack: () => void;
  onOpenCraft: (cardDefId: string) => void;
  onOpenShop: () => void;
}

export function CollectionScreen({ economyStore, onBack, onOpenCraft, onOpenShop }: Props) {
  const { balance, collection, loading, error, refetch } = economyStore;
  
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'owned' | 'missing' | 'blueprint'>('all');
  const [scopeFilter, setScopeFilter] = useState<string>('main');
  const [selectedCard, setSelectedCard] = useState<any>(null);
  const [convertOpen, setConvertOpen] = useState(false);

  const allCards = useMemo(() => Object.values(allCardsById()), []);
  
  // Фильтруем карты по скоупу
  const scopeCards = useMemo(() => {
    if (scopeFilter === 'all') return allCards;
    const allowedSeries = SCOPES[scopeFilter]?.series ?? [];
    return allCards.filter(c => c.series?.some(s => allowedSeries.includes(s)));
  }, [allCards, scopeFilter]);

  // Собираем полную информацию
  const cardsWithStatus = useMemo(() => {
    return scopeCards
      .filter(c => !c.isToken)
      .map(def => {
        const userCard = collection.find(c => c.cardDefId === def.id);
        return {
          def,
          count: userCard?.count ?? 0,
          hasBlueprint: userCard?.hasBlueprint ?? false,
          upgradeLevel: userCard?.upgradeLevel ?? 0,
        };
      })
      .filter(c => {
        if (search && !c.def.name.toLowerCase().includes(search.toLowerCase())) return false;
        if (filterStatus === 'owned' && c.count === 0) return false;
        if (filterStatus === 'missing' && c.count > 0) return false;
        if (filterStatus === 'blueprint' && !c.hasBlueprint) return false;
        return true;
      });
  }, [scopeCards, collection, search, filterStatus]);

  // Группировка по личностям
  const groupedByPersonality = useMemo(() => {
    const groups = new Map<string, typeof cardsWithStatus>();
    for (const c of cardsWithStatus) {
      const tag = c.def.personalityTag;
      if (!groups.has(tag)) groups.set(tag, []);
      groups.get(tag)!.push(c);
    }
    for (const arr of groups.values()) {
      arr.sort((a, b) => a.def.cost - b.def.cost);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [cardsWithStatus]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Загрузка коллекции...</div>;
  if (error) return <div style={{ padding: 40, textAlign: 'center', color: 'red' }}>Ошибка: {error}</div>;

  return (
    <div className="page-screen" style={{ overflowY: 'auto', height: '100vh' }}>
      <div className="page-card" style={{ maxWidth: 1200, margin: '0 auto', width: '100%' }}>
        <header style={{ display: 'flex', alignItems: 'center', marginBottom: 20, gap: 16 }}>
          <button className="btn-header" onClick={onBack}>← Назад</button>
          <h1 style={{ margin: 0, fontSize: '24px' }}>📦 Моя Коллекция</h1>
          <div style={{ flex: 1 }} />
          <button className="btn-header btn-primary" onClick={onOpenShop}>🎁 Бустеры</button>
        </header>

        <ShardBalanceBar balance={balance} onOpenConvert={() => setConvertOpen(true)} />

        <div style={{ display: 'flex', gap: 16, margin: '20px 0', background: 'rgba(0,0,0,0.1)', padding: 12, borderRadius: 8 }}>
          <input 
            type="text" 
            placeholder="Поиск по имени..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid #444', background: '#222', color: '#fff' }}
          />
          <select 
            value={filterStatus} 
            onChange={e => setFilterStatus(e.target.value as any)}
            style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid #444', background: '#222', color: '#fff' }}
          >
            <option value="all">Все карты</option>
            <option value="owned">Собрано (есть копии)</option>
            <option value="missing">Не собрано</option>
            <option value="blueprint">Есть чертёж</option>
          </select>
          
          <select 
            value={scopeFilter} 
            onChange={e => setScopeFilter(e.target.value)}
            style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid #444', background: '#222', color: '#fff' }}
          >
            <option value="main">Только Основная игра (Main)</option>
            <option value="ashenlight">Пепельный свет (Legacy)</option>
            <option value="oskol">Оскол (Legacy)</option>
            <option value="all">Все серии</option>
          </select>
        </div>

        <div className="collection-content" style={{ paddingBottom: 40 }}>
          {groupedByPersonality.map(([personality, cards]) => {
            const total = cards.length;
            const ownedCount = cards.filter(c => c.count > 0).length;
            const isComplete = total > 0 && total === ownedCount;

            return (
              <div key={personality} style={{ marginBottom: 30 }}>
                <div style={{ 
                  display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12,
                  padding: '4px 8px', borderLeft: `4px solid ${isComplete ? '#f59e0b' : '#555'}`,
                  background: isComplete ? 'rgba(245, 158, 11, 0.1)' : 'transparent'
                }}>
                  <h2 style={{ margin: 0, fontSize: '18px' }}>{getPersonalityName(personality)}</h2>
                  <span style={{ fontSize: '13px', color: '#888' }}>
                    Собрано {ownedCount} из {total}
                  </span>
                  {isComplete && <span title="Все аспекты собраны">🏆</span>}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
                  {cards.map(c => (
                    <div 
                      key={c.def.id}
                      onClick={() => setSelectedCard(c)}
                      style={{
                        background: c.count > 0 ? '#2a2a2a' : '#1a1a1a',
                        border: `1px solid ${c.count > 0 ? RARITY_COLOR[c.def.rarity] : '#333'}`,
                        borderRadius: 8,
                        padding: 10,
                        cursor: c.hasBlueprint ? 'pointer' : 'default',
                        opacity: c.count > 0 || c.hasBlueprint ? 1 : 0.6,
                        position: 'relative',
                        display: 'flex', flexDirection: 'column', gap: 4
                      }}
                    >
                      <div style={{ fontSize: '12px', fontWeight: 'bold', color: c.count > 0 ? '#fff' : '#888' }}>
                        {c.def.name}
                      </div>
                      <div style={{ fontSize: '11px', color: '#888', display: 'flex', justifyContent: 'space-between' }}>
                        <span>{c.def.series?.length ? getSeriesName(c.def.series[0]) : '—'}</span>
                        <span>💰{c.def.cost}</span>
                      </div>
                      
                      <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: '12px', fontWeight: 'bold', color: c.count > 0 ? '#22c55e' : '#ef4444' }}>
                          {c.count > 0 ? `×${c.count}` : 'Нет'}
                        </div>
                        {c.hasBlueprint && <span title="Есть чертёж" style={{ fontSize: '14px' }}>📐</span>}
                        {c.upgradeLevel > 0 && <span style={{ fontSize: '12px', color: '#f59e0b' }}>★+{c.upgradeLevel}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
		{selectedCard && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setSelectedCard(null)}>
            <div style={{ background: '#222', padding: 24, borderRadius: 12, width: 360, border: '1px solid #444', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
              <h3 style={{ marginTop: 0 }}>{selectedCard.def.name}</h3>
              <p style={{ color: '#888' }}>В коллекции: {selectedCard.count} шт.</p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
                {selectedCard.hasBlueprint && (
                  <button className="btn-primary" onClick={() => { onOpenCraft(selectedCard.def.id); setSelectedCard(null); }}>
                    🔨 Крафтить (в разработке)
                  </button>
                )}
                {selectedCard.count >= 1 && (
                  <button className="btn-header" style={{ borderColor: '#ef4444', color: '#ef4444' }} onClick={() => {
                    setSelectedCard({ ...selectedCard, modal: 'disenchant' });
                  }}>
                    ♻ Разобрать
                  </button>
                )}
                {selectedCard.count > 1 && (
                  <button className="btn-header" style={{ borderColor: '#f59e0b', color: '#f59e0b' }} onClick={() => {
                    setSelectedCard({ ...selectedCard, modal: 'upgrade' });
                  }}>
                    ⬆ Улучшить
                  </button>
                )}
                <button className="btn-header" onClick={() => setSelectedCard(null)}>Закрыть</button>
              </div>
            </div>
          </div>
        )}

        {selectedCard?.modal === 'disenchant' && (
          <DisenchantModal 
            cardDefId={selectedCard.def.id} 
            cardName={selectedCard.def.name} 
            rarity={selectedCard.def.rarity} 
            series={selectedCard.def.series?.[0] ?? 'classic'} 
            maxCount={selectedCard.count} 
            onClose={() => setSelectedCard(null)} 
            onSuccess={() => refetch()} 
          />
        )}

        {selectedCard?.modal === 'upgrade' && (
          <UpgradeModal 
            cardDefId={selectedCard.def.id} 
            cardName={selectedCard.def.name} 
            currentLevel={selectedCard.upgradeLevel}
            maxCount={selectedCard.count - 1} 
            onClose={() => setSelectedCard(null)} 
            onSuccess={() => refetch()} 
          />
        )}

        {convertOpen && (
          <ConvertShardsModal 
            onClose={() => setConvertOpen(false)} 
            onSuccess={() => refetch()} 
          />
        )}
      </div>
    </div>
  );
}