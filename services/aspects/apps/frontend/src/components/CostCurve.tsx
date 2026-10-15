import { useMemo } from 'react';
import { getCards } from '@aspects/cards';

interface Props {
  cardIds: string[];
  series: string[];
  compact?: boolean;
}

export function CostCurve({ cardIds, series, compact = false }: Props) {
  const { bars, max, empty } = useMemo(() => {
    if (cardIds.length === 0) {
      return { bars: [], max: 1, empty: true };
    }
    const merged = new Map<string, { cost: number }>();
    for (const s of series) {
      try {
        for (const c of getCards(s)) {
          if (!merged.has(c.id)) merged.set(c.id, c);
        }
      } catch {
        // неизвестная серия
      }
    }
    const bins = [0, 0, 0, 0, 0, 0, 0, 0];
    for (const id of cardIds) {
      const c = merged.get(id);
      if (!c) continue;
      const idx = Math.min(7, Math.max(0, c.cost));
      bins[idx]++;
    }
    return { bars: bins, max: Math.max(...bins, 1), empty: false };
  }, [cardIds, series]);

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