import { useEffect, useMemo, useRef, useState } from 'react';
import type { LogEntry, LogKind } from '../game/logEntry';
import type { PlayerId } from '@aspects/engine';

interface Props {
  entries: LogEntry[];
}

type PlayerFilter = 'all' | PlayerId;

const KIND_GROUPS: Array<{ id: string; label: string; kinds: LogKind[] }> = [
  { id: 'combat', label: 'Бой', kinds: ['damage', 'death'] },
  { id: 'action', label: 'Действия', kinds: ['play', 'summon', 'choice'] },
  { id: 'board', label: 'Захват', kinds: ['capture'] },
  { id: 'system', label: 'Система', kinds: ['turn', 'glory', 'gameover', 'error'] },
];

const ALL_KINDS: LogKind[] = KIND_GROUPS.flatMap((g) => g.kinds);

export function Log({ entries }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [playerFilter, setPlayerFilter] = useState<PlayerFilter>('all');
  const [enabledGroups, setEnabledGroups] = useState<Set<string>>(
    () => new Set(KIND_GROUPS.map((g) => g.id)),
  );

  const filtered = useMemo(() => {
    const enabledKinds = new Set<LogKind>();
    for (const g of KIND_GROUPS) {
      if (enabledGroups.has(g.id)) {
        for (const k of g.kinds) enabledKinds.add(k);
      }
    }
    return entries.filter((e) => {
      if (!enabledKinds.has(e.kind)) return false;
      if (playerFilter !== 'all' && e.playerId && e.playerId !== playerFilter) return false;
      return true;
    });
  }, [entries, playerFilter, enabledGroups]);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [filtered.length]);

  const toggleGroup = (id: string) => {
    setEnabledGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allGroupsOn = enabledGroups.size === KIND_GROUPS.length;

  return (
    <div className="log">
      <div className="log-header">
        <span>Лог</span>
        <span className="log-count">{filtered.length}/{entries.length}</span>
      </div>

      <div className="log-filters">
        <div className="log-filter-row">
          <button
            className={`log-chip ${playerFilter === 'all' ? 'log-chip-active' : ''}`}
            onClick={() => setPlayerFilter('all')}
          >
            Все
          </button>
          <button
            className={`log-chip log-chip-p1 ${playerFilter === 'p1' ? 'log-chip-active' : ''}`}
            onClick={() => setPlayerFilter(playerFilter === 'p1' ? 'all' : 'p1')}
          >
            P1
          </button>
          <button
            className={`log-chip log-chip-p2 ${playerFilter === 'p2' ? 'log-chip-active' : ''}`}
            onClick={() => setPlayerFilter(playerFilter === 'p2' ? 'all' : 'p2')}
          >
            P2
          </button>
        </div>
        <div className="log-filter-row">
          {KIND_GROUPS.map((g) => (
            <button
              key={g.id}
              className={`log-chip ${enabledGroups.has(g.id) ? 'log-chip-active' : ''}`}
              onClick={() => toggleGroup(g.id)}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      <div className="log-entries" ref={containerRef}>
        {filtered.length === 0 && (
          <div className="log-empty">Нет событий по фильтру</div>
        )}
        {filtered.map((e) => (
          <div key={e.id} className={`log-entry log-entry-${e.kind}`}>
            {e.text}
          </div>
        ))}
      </div>
    </div>
  );
}