import { useMemo } from 'react';
import { getCards } from '@aspects/cards';

interface Props {
  cardIds: string[];
  packId: string;
  compact?: boolean;
}

export function CostCurve({ cardIds, packId, compact = false }: Props) {
  const { bars, max, empty } = useMemo(() => {
    if (cardIds.length === 0) {
      return { bars: [], max: 1, empty: true };
    }
    const byId = new Map(getCards(packId).map((c) => [c.id, c]));
    const bins = [0, 0, 0, 0, 0, 0, 0, 0];
    for (const id of cardIds) {
      const c = byId.get(id);
      if (!c) continue;
      const idx = Math.min(7, Math.max(0, c.cost));
      bins[idx]++;
    }
    return { bars: bins, max: Math.max(...bins, 1), empty: false };
  }, [cardIds, packId]);

  if (empty) {
    return (
      <div className={`cost-curve ${compact ? 'cost-curve-compact' : ''}`}>
        <div className="cost-curve-empty">Нет данных о колоде</div>
      </div>
    );
  }

  return (
    <div className={`cost-curve ${compact ? 'cost-curve-compact' : ''}`}>
      {bars.map((v, i) => (
        <div key={i} className="cost-curve-col">
          <div
            className="cost-curve-bar"
            style={{ height: `${(v / max) * 100}%` }}
            title={`${i === 7 ? '7+' : i}💰 · ${v} карт`}
          />
          <div className="cost-curve-label">{i === 7 ? '7+' : i}</div>
        </div>
      ))}
    </div>
  );
}