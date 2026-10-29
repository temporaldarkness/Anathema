import { useMemo, useState } from 'react';
import type { DeckDto } from '@aspects/shared';
import { getCards, listPacks, getSeriesName } from '@aspects/cards';
import type { AuthState } from '../game/useAuth';
import type { UseDecksResult } from '../game/useDecks';
import { AuthBadge } from './AuthBadge';
import { CostCurve } from './CostCurve';
import { useConfirm } from '../game/confirmContext';
import { ErrorToast } from './ErrorToast';
import { isDeckBroken } from '../game/deckUtils';

interface Props {
  auth: AuthState;
  deckStore: UseDecksResult;
  onBack: () => void;
  onEdit: (deckId: string) => void;
  onNew: () => void;
}

export function DecksScreen({ auth, deckStore, onBack, onEdit, onNew }: Props) {
  const { decks, loading, error, isLocal, remove } = deckStore;

  const confirm = useConfirm();

  const [actionError, setActionError] = useState<string | null>(null);

  const sortedDecks = useMemo(
    () => [...decks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [decks],
  );

  const handleDelete = async (deck: DeckDto) => {
    const ok = await confirm({
      title: `Удалить колоду «${deck.name}»?`,
      confirmLabel: 'Удалить',
      danger: true,
    });
    if (!ok) return;
    remove(deck.id).catch((e: unknown) => {
      setActionError('Не удалось удалить: ' + (e as Error).message);
    });
  };

  return (
    <div className="page-screen">
      <div className="page-card">
        <div className="page-header">
          <button className="page-header-back" onClick={onBack}>
            ← Профиль
          </button>
          <h1 className="page-header-title">Мои колоды</h1>
          <div className="page-header-actions">
            <AuthBadge auth={auth} />
            <button className="btn-header btn-primary" onClick={onNew}>
              + Новая колода
            </button>
          </div>
        </div>

        <ErrorToast
          message={actionError}
          onClose={() => setActionError(null)}
        />

        {isLocal && (
          <div className="decks-warning">
            ⚠ Вы в анонимном режиме. Колоды сохраняются только в этом браузере
            и будут потеряны при очистке кэша.
          </div>
        )}

        {error && <div className="decks-error">Ошибка загрузки: {error}</div>}
        {loading && <div className="decks-loading">Загрузка…</div>}

        {!loading && sortedDecks.length === 0 && (
          <div className="page-empty">
            <div className="page-empty-icon">🃏</div>
            <div className="page-empty-text">Пока нет ни одной колоды</div>
            <button
              className="setup-start"
              onClick={onNew}
              style={{ maxWidth: 260, margin: '0 auto' }}
            >
              Создать первую
            </button>
          </div>
        )}

        {!loading && sortedDecks.length > 0 && (
          <div className="deck-cards-grid">
            {sortedDecks.map((deck) => (
              <DeckCard
                key={deck.id}
                deck={deck}
                onEdit={() => onEdit(deck.id)}
                onDelete={() => handleDelete(deck)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DeckCard({
  deck,
  onEdit,
  onDelete,
}: {
  deck: DeckDto;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const series = useMemo(
    () => deck.series,
    [deck],
  );

  const seriesNames = useMemo(
    () => series.map(getSeriesName),
    [series],
  );

  const stats = useMemo(() => {
    const merged = new Map<string, ReturnType<typeof getCards>[number]>();
    for (const s of series) {
      try {
        for (const c of getCards(s)) {
          if (!merged.has(c.id)) merged.set(c.id, c);
        }
      } catch {
        // неизвестная серия — пропускаем
      }
    }

    const uniqueCards = new Set(deck.cardIds).size;
    const totalCost = deck.cardIds.reduce(
      (sum, id) => sum + (merged.get(id)?.cost ?? 0),
      0,
    );
    const avgCost =
      deck.cardIds.length > 0 ? totalCost / deck.cardIds.length : 0;
    const legendaries = deck.cardIds.filter(
      (id) => merged.get(id)?.rarity === 'legendary',
    ).length;

    return { uniqueCards, avgCost, legendaries };
  }, [deck, series]);

  const updated = new Date(deck.updatedAt);
  const updatedText = updated.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
  
    const broken = isDeckBroken(deck);

  return (
    <div 
      className="deck-card" 
      onClick={onEdit}
      style={broken ? { border: '2px solid #ef4444', background: 'rgba(239, 68, 68, 0.05)' } : {}}
    >
      <div className="deck-card-header">
        <div className="deck-card-name" style={broken ? { color: '#ef4444' } : {}}>
          {deck.name} {broken && '⚠️'}
        </div>
        <button
          className="deck-card-delete"
          title="Удалить"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          🗑
        </button>
      </div>

      {broken && (
        <div style={{ 
          color: '#ef4444', 
          fontSize: '11px', 
          background: 'rgba(239,68,68,0.1)', 
          padding: '6px 8px', 
          borderRadius: '4px',
          marginBottom: '8px',
          textAlign: 'center',
          fontWeight: 600
        }}>
          Требует исправления (есть удалённые карты)
        </div>
      )}

      <div className="deck-card-stats">
        <div className="deck-stat-cell">
          <b>{deck.cardIds.length}</b>
          <span>карт</span>
        </div>
        <div className="deck-stat-cell">
          <b>{stats.uniqueCards}</b>
          <span>уникальных</span>
        </div>
        <div className="deck-stat-cell">
          <b>{stats.avgCost.toFixed(1)}</b>
          <span>ср. цена</span>
        </div>
        <div className="deck-stat-cell">
          <b>{stats.legendaries}</b>
          <span>легенд.</span>
        </div>
      </div>

      <CostCurve cardIds={deck.cardIds} series={series} compact />

      {seriesNames.length > 0 && (
        <div className="deck-card-tags">
          {seriesNames.map((name) => (
            <span key={name} className="deck-card-tag deck-card-tag-series">
              {name}
            </span>
          ))}
        </div>
      )}

      <div className="deck-card-footer">обновлена {updatedText}</div>
    </div>
  );
}