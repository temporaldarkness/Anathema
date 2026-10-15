import { useMemo, useState, useEffect, useRef } from 'react';
import type { DeckDto, CreateDeckDto } from '@aspects/shared';
import { validateDeck, errorText, generateRandomDeck } from '@aspects/shared';
import { getCards, listPacks, type CardDefinition } from '@aspects/cards';
import type { UseDecksResult } from '../game/useDecks';
import { HoverTooltip } from './HoverTooltip';
import { CardTooltipDef } from './CardTooltipDef';
import { useConfirm } from '../game/confirmContext';
import { RARITY_COLOR, RARITY_TEXT, triggerText } from '../game/abilityText';

interface Props {
  deckId: string | null;
  deckStore: UseDecksResult;
  onBack: () => void;
}

const PACKS = listPacks();
const MAX_SERIES = 4;

interface DeckState {
  id: string | null;
  name: string;
  description: string;
  series: string[];
  cardIds: string[];
}

interface Toast {
  id: number;
  kind: 'warn' | 'error' | 'info';
  text: string;
}

function emptyDeck(): DeckState {
  return { id: null, name: '', description: '', series: [], cardIds: [] };
}

function deckFromDto(dto: DeckDto): DeckState {
  const series = dto.series;
  return {
    id: dto.id,
    name: dto.name,
    description: dto.description,
    series,
    cardIds: [...dto.cardIds],
  };
}

function buildPool(series: string[]): CardDefinition[] {
  const merged = new Map<string, CardDefinition>();
  for (const s of series) {
    try {
      for (const c of getCards(s)) {
        if (!merged.has(c.id)) merged.set(c.id, c);
      }
    } catch {
      // неизвестная серия — пропускаем
    }
  }
  return [...merged.values()];
}

export function DeckEditorScreen({ deckId, deckStore, onBack }: Props) {
  const confirm = useConfirm();
  const [deck, setDeck] = useState<DeckState>(() => {
    if (deckId) {
      const found = deckStore.decks.find((d) => d.id === deckId);
      if (found) return deckFromDto(found);
    }
    return emptyDeck();
  });
  const [saving, setSaving] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [seriesOpen, setSeriesOpen] = useState(false);
  const [detailCard, setDetailCard] = useState<CardDefinition | null>(null);
  const toastIdRef = useRef(0);
  
  const [seriesAutoOpened, setSeriesAutoOpened] = useState(false);
  
  useEffect(() => {
    if (seriesAutoOpened) return;
    if (deck.id !== null) return;
    if (deck.series.length > 0) return;
    if (deck.cardIds.length > 0) return;
    setSeriesOpen(true);
    setSeriesAutoOpened(true);
  }, [deck.id, deck.series.length, deck.cardIds.length, seriesAutoOpened]);

  useEffect(() => {
    if (!deckId) return;
    if (deck.id === deckId) return;
    const found = deckStore.decks.find((d) => d.id === deckId);
    if (found) setDeck(deckFromDto(found));
  }, [deckId, deckStore.decks, deck.id]);

  const allCards = useMemo(() => buildPool(deck.series), [deck.series]);

  const validation = useMemo(
    () => validateDeck(deck.cardIds, allCards, deck.series),
    [deck.cardIds, allCards, deck.series],
  );

  const personalityCounts = useMemo(() => {
    const byId = new Map(allCards.map((c) => [c.id, c]));
    const counts = new Map<string, number>();
    for (const id of deck.cardIds) {
      const def = byId.get(id);
      if (!def) continue;
      counts.set(def.personalityTag, (counts.get(def.personalityTag) ?? 0) + 1);
    }
    return counts;
  }, [deck.cardIds, allCards]);

  const pushToast = (kind: Toast['kind'], text: string) => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, kind, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2200);
  };

  const toggleSeries = (seriesId: string) => {
    const has = deck.series.includes(seriesId);
    let nextSeries: string[];
    if (has) {
      nextSeries = deck.series.filter((s) => s !== seriesId);
    } else {
      if (deck.series.length >= MAX_SERIES) {
        pushToast('warn', `Не больше ${MAX_SERIES} серий`);
        return;
      }
      nextSeries = [...deck.series, seriesId];
    }
  
    const pool = buildPool(nextSeries);
    const poolIds = new Set(pool.map((c) => c.id));
    const filteredCardIds = deck.cardIds.filter((id) => poolIds.has(id));
    const removed = deck.cardIds.length - filteredCardIds.length;
  
    if (removed > 0 && has) {
      pushToast(
        'info',
        `Убрано ${removed} карт${removed === 1 ? 'а' : ''} — не из выбранных серий`,
      );
    }
  
    setDeck({ ...deck, series: nextSeries, cardIds: filteredCardIds });
  };

  const handleAddCard = (card: CardDefinition) => {
    if (deck.cardIds.length >= 30) {
      pushToast('warn', 'Колода полна: 30/30');
      return;
    }
    const inSeries = (card.series ?? []).some((s) => deck.series.includes(s));
    if (!inSeries) {
      pushToast('warn', `${card.name} не из выбранных серий`);
      return;
    }
    const already = personalityCounts.get(card.personalityTag) ?? 0;
    if (already >= 5) {
      pushToast('warn', `Уже 5 копий личности: ${card.name}`);
      return;
    }
    const aspectCount = deck.cardIds.filter((id) => id === card.id).length;
    if (aspectCount >= 2) {
      pushToast('warn', `Уже 2 копии аспекта: ${card.name}`);
      return;
    }
    if (card.rarity === 'legendary' && aspectCount >= 1) {
      pushToast('warn', `Легендарка уже добавлена: ${card.name}`);
      return;
    }
    setDeck({ ...deck, cardIds: [...deck.cardIds, card.id] });
  };

  const handleRemoveCard = (cardId: string) => {
    const idx = deck.cardIds.lastIndexOf(cardId);
    if (idx < 0) return;
    const next = [...deck.cardIds];
    next.splice(idx, 1);
    setDeck({ ...deck, cardIds: next });
  };

  const handleRandom = async () => {
    if (deck.series.length === 0) {
      pushToast('warn', 'Сначала выберите хотя бы одну серию');
      return;
    }
    if (deck.cardIds.length > 0) {
      const ok = await confirm({
        title: 'Заменить текущую колоду случайной?',
        confirmLabel: 'Заменить',
      });
      if (!ok) return;
    }
    const ids = generateRandomDeck(allCards, { size: 30 });
    if (!ids) {
      pushToast('error', 'Не удалось сгенерировать колоду');
      return;
    }
    setDeck({ ...deck, cardIds: ids });
    pushToast('info', `Сгенерировано ${ids.length} карт`);
  };

  const handleSave = async () => {
    if (!deck.name.trim()) {
      pushToast('error', 'Укажите название');
      return;
    }
    if (deck.series.length === 0) {
      pushToast('error', 'Выберите хотя бы одну серию');
      return;
    }
    if (!validation.valid) {
      pushToast('error', validation.errors.map(errorText).join('; '));
      return;
    }
    setSaving(true);

    const dto: CreateDeckDto = {
      name: deck.name.trim(),
      description: deck.description.trim() || undefined,
      series: deck.series,
      cardIds: deck.cardIds,
    };

    try {
      if (deck.id) {
        await deckStore.update(deck.id, dto);
      } else {
        const created = await deckStore.create(dto);
        setDeck({ ...deck, id: created.id });
      }
      onBack();
    } catch (e) {
      pushToast('error', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const totalCost = useMemo(() => {
    const byId = new Map(allCards.map((c) => [c.id, c]));
    return deck.cardIds.reduce((s, id) => s + (byId.get(id)?.cost ?? 0), 0);
  }, [deck.cardIds, allCards]);

  const avgCost = deck.cardIds.length > 0 ? totalCost / deck.cardIds.length : 0;

  return (
    <div className="deck-editor-screen">
      <header className="deck-editor-header">
        <button className="btn-header" onClick={onBack}>
          ← Назад
        </button>
        <input
          className="deck-editor-name"
          placeholder="Название колоды"
          value={deck.name}
          onChange={(e) => setDeck({ ...deck, name: e.target.value })}
          maxLength={64}
        />
        <button
          className="btn-header"
          onClick={handleRandom}
          title="Случайная колода"
        >
          🎲
        </button>
        <button
          className={`btn-header ${deck.series.length === 0 ? 'btn-header-attention' : ''}`}
          onClick={() => setSeriesOpen(true)}
          title="Выбрать серии (до 4)"
        >
          📦 Серии ({deck.series.length}/{MAX_SERIES})
        </button>
        <div className="deck-editor-counter">
          {deck.cardIds.length === 30 ? (
            <span className="deck-editor-counter-full">30/30 ✓</span>
          ) : (
            <>
              {deck.cardIds.length}/30
              <span className="deck-editor-counter-remaining">
                {' '}
                осталось {30 - deck.cardIds.length}
              </span>
            </>
          )}
          <span className="deck-editor-counter-cost">
            {' '}
            · ср.{avgCost.toFixed(1)}
          </span>
        </div>
        <button
          className="btn-header btn-primary"
          onClick={handleSave}
          disabled={saving || !validation.valid}
          title={validation.valid ? '' : 'Колода невалидна'}
        >
          {saving ? 'Сохранение…' : 'Сохранить'}
        </button>
      </header>

      <div className="deck-editor-body">
        <CardPool
          deck={deck}
          allCards={allCards}
          personalityCounts={personalityCounts}
          onAdd={handleAddCard}
          onShowDetail={setDetailCard}
        />
        <DeckContent
          deck={deck}
          allCards={allCards}
          onRemove={handleRemoveCard}
        />
      </div>

      {seriesOpen && (
        <SeriesPickerModal
          selected={deck.series}
          onToggle={toggleSeries}
          onClose={() => setSeriesOpen(false)}
        />
      )}

      {detailCard && (
        <CardDetailModal card={detailCard} onClose={() => setDetailCard(null)} />
      )}

      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Модалка серий ───

function SeriesPickerModal({
  selected,
  onToggle,
  onClose,
}: {
  selected: string[];
  onToggle: (id: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="theme-modal-overlay" onClick={onClose}>
      <div
        className="theme-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 640 }}
      >
        <div className="theme-modal-header">
          <h2 className="theme-modal-title">
            Серии колоды ({selected.length}/{MAX_SERIES})
          </h2>
          <button className="theme-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="series-picker-body">
          {PACKS.map((p) => {
            const isSelected = selected.includes(p.id);
            const isLocked = !isSelected && selected.length >= MAX_SERIES;
            return (
              <button
                key={p.id}
                className={`series-picker-tile ${isSelected ? 'series-picker-tile-active' : ''} ${isLocked ? 'series-picker-tile-locked' : ''}`}
                onClick={() => !isLocked && onToggle(p.id)}
                disabled={isLocked}
              >
                <div className="series-picker-check">{isSelected ? '✓' : ''}</div>
                <div className="series-picker-name">{p.name}</div>
                <div className="series-picker-desc">{p.description}</div>
                <div className="series-picker-meta">
                  {getCards(p.id).length} карт
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CardDetailModal({
  card,
  onClose,
}: {
  card: CardDefinition;
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const rarityColor = RARITY_COLOR[card.rarity] ?? '#2c313a';
  const keywords = card.abilities ?? [];
  const triggers = card.triggers ?? [];
  const activated = card.activatedAbilities ?? [];

  return (
    <div className="theme-modal-overlay" onClick={onClose}>
      <div
        className="theme-modal card-detail-modal"
        style={{ ['--rarity-color' as string]: rarityColor }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-detail-stripe" />
        <div className="theme-modal-header">
          <div className="card-detail-title-block">
            <div className="card-detail-name">{card.name}</div>
            {card.title && (
              <div className="card-detail-subtitle">{card.title}</div>
            )}
          </div>
          <button className="theme-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="card-detail-body">
          <div className="card-detail-stats">
            <span className="card-detail-stat card-detail-stat-cost">
              💰 {card.cost}
            </span>
            <span className="card-detail-stat card-detail-stat-str">
              ⚔ {card.strength}
            </span>
            <span className="card-detail-stat card-detail-stat-hp">
              ❤ {card.health}
            </span>
            <span className="card-detail-rarity">
              {RARITY_TEXT[card.rarity] ?? card.rarity}
            </span>
          </div>

          {card.shortDescription && (
            <div className="card-detail-short">{card.shortDescription}</div>
          )}

          {(card.series?.length || card.factions?.length || card.roles?.length) && (
            <div className="card-detail-tags">
              {card.series?.map((s) => (
                <span key={`s-${s}`} className="card-detail-tag-series">
                  {s}
                </span>
              ))}
              {card.factions?.map((f) => (
                <span key={`f-${f}`} className="card-detail-tag-faction">
                  {f}
                </span>
              ))}
              {card.roles?.map((r) => (
                <span key={`r-${r}`} className="card-detail-tag-role">
                  {r}
                </span>
              ))}
            </div>
          )}

          {keywords.length > 0 && (
            <div className="card-detail-section">
              <div className="card-detail-section-title">Ключевые слова</div>
              {keywords.map((kw) => {
                const info = card.abilityInfo?.[kw];
                return (
                  <div key={kw} className="card-detail-ability">
                    <div className="card-detail-ability-name">
                      {info?.name ?? kw}
                    </div>
                    {info?.description && (
                      <div className="card-detail-ability-desc">
                        {info.description}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {triggers.length > 0 && (
            <div className="card-detail-section">
              <div className="card-detail-section-title">Способности</div>
              {triggers.map((t, i) => (
                <div key={i} className="card-detail-ability">
                  <div className="card-detail-ability-name">
                    {t.name ?? triggerText(t.trigger)}
                    {t.oncePerTurn && (
                      <span className="card-detail-tag">1/ход</span>
                    )}
                  </div>
                  {t.description && (
                    <div className="card-detail-ability-desc">
                      {t.description}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {activated.length > 0 && (
            <div className="card-detail-section">
              <div className="card-detail-section-title">Активируемые</div>
              {activated.map((a) => (
                <div key={a.id} className="card-detail-ability">
                  <div className="card-detail-ability-name">
                    ⚡ {a.name ?? a.id}
                    <span className="card-detail-tag">{a.cost}💰</span>
                  </div>
                  {a.description && (
                    <div className="card-detail-ability-desc">
                      {a.description}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {card.lore && (
            <div className="card-detail-lore-block">
              <div className="card-detail-section-title">Лор</div>
              <div className="card-detail-lore">{card.lore}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Пул карт ───

interface CardPoolProps {
  deck: DeckState;
  allCards: CardDefinition[];
  personalityCounts: Map<string, number>;
  onAdd: (card: CardDefinition) => void;
  onShowDetail: (card: CardDefinition) => void;
}

function CardPool({
  deck,
  allCards,
  personalityCounts,
  onAdd,
  onShowDetail,
}: CardPoolProps) {
  const [search, setSearch] = useState('');
  const [rarityFilter, setRarityFilter] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [hideUsed, setHideUsed] = useState(false);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    for (const c of allCards) for (const t of c.tags ?? []) s.add(t);
    return [...s].sort();
  }, [allCards]);

  const filtered = useMemo(() => {
    const list = allCards.filter((c) => {
      if (c.isToken) return false;
      if (rarityFilter !== 'all' && c.rarity !== rarityFilter) return false;
      if (tagFilter !== 'all' && !(c.tags ?? []).includes(tagFilter)) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!c.name.toLowerCase().includes(s)) return false;
      }
      if (hideUsed) {
        const count = personalityCounts.get(c.personalityTag) ?? 0;
        if (count >= 5) return false;
        if (c.rarity === 'legendary' && deck.cardIds.includes(c.id)) return false;
      }
      return true;
    });
    return [...list].sort(
      (a, b) => a.cost - b.cost || a.name.localeCompare(b.name),
    );
  }, [
    search,
    rarityFilter,
    tagFilter,
    hideUsed,
    personalityCounts,
    deck.cardIds,
    allCards,
  ]);

  if (deck.series.length === 0) {
    return (
      <div className="card-pool">
        <div className="deck-list-empty">
          Выберите серии — карты появятся здесь
        </div>
      </div>
    );
  }

  return (
    <div className="card-pool">
      <div className="card-pool-filters">
        <input
          className="card-pool-search"
          placeholder="Поиск по имени…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="card-pool-select"
          value={rarityFilter}
          onChange={(e) => setRarityFilter(e.target.value)}
        >
          <option value="all">Все редкости</option>
          <option value="common">Обычные</option>
          <option value="uncommon">Необычные</option>
          <option value="rare">Редкие</option>
          <option value="epic">Эпические</option>
          <option value="legendary">Легендарные</option>
        </select>
        <select
          className="card-pool-select"
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
        >
          <option value="all">Все теги</option>
          {allTags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <label className="card-pool-checkbox">
          <input
            type="checkbox"
            checked={hideUsed}
            onChange={(e) => setHideUsed(e.target.checked)}
          />
          Скрыть недоступные
        </label>
      </div>

      <div className="card-pool-grid">
        {filtered.map((c) => {
          const count = personalityCounts.get(c.personalityTag) ?? 0;
          const atLimit = count >= 5;
          const legendaryUsed =
            c.rarity === 'legendary' && deck.cardIds.includes(c.id);
          const deckFull = deck.cardIds.length >= 30;
          const blocked = atLimit || legendaryUsed || deckFull;

          return (
            <HoverTooltip
              key={c.id}
              className={`card-pool-card card-rarity-${c.rarity} ${
                blocked ? 'card-pool-card-blocked' : ''
              }`}
              content={<CardTooltipDef def={c} />}
              onClick={() => onAdd(c)}
            >
              {count > 0 && (
                <div className="card-pool-card-count">×{count}</div>
              )}
              <div
                className="card-pool-card-info"
                onClick={(e) => {
                  e.stopPropagation();
                  onShowDetail(c);
                }}
                title="Детали"
              >
                ⓘ
              </div>
              <div className="card-pool-card-name">{c.name}</div>
              <div className="card-pool-card-stats">
                <span className="cpc-stat cpc-cost">💰{c.cost}</span>
                <span className="cpc-stat cpc-str">⚔{c.strength}</span>
                <span className="cpc-stat cpc-hp">❤{c.health}</span>
              </div>
            </HoverTooltip>
          );
        })}
      </div>
    </div>
  );
}

// ─── Содержимое колоды ───

interface DeckContentProps {
  deck: DeckState;
  allCards: CardDefinition[];
  onRemove: (cardId: string) => void;
}

function DeckContent({ deck, allCards, onRemove }: DeckContentProps) {
  const grouped = useMemo(() => {
    const m = new Map<string, number>();
    for (const id of deck.cardIds) {
      m.set(id, (m.get(id) ?? 0) + 1);
    }
    const byId = new Map(allCards.map((c) => [c.id, c]));
    return [...m.entries()]
      .map(([id, count]) => ({ card: byId.get(id), count }))
      .filter((x) => x.card)
      .sort(
        (a, b) =>
          a.card!.cost - b.card!.cost ||
          a.card!.name.localeCompare(b.card!.name),
      );
  }, [deck.cardIds, allCards]);

  const manaCurve = useMemo(() => {
    const curve = [0, 0, 0, 0, 0, 0, 0, 0];
    const byId = new Map(allCards.map((c) => [c.id, c]));
    for (const id of deck.cardIds) {
      const c = byId.get(id);
      if (!c) continue;
      const bucket = Math.min(c.cost, 7);
      curve[bucket] = (curve[bucket] ?? 0) + 1;
    }
    return curve;
  }, [deck.cardIds, allCards]);

  const maxCurve = Math.max(1, ...manaCurve);

  return (
    <div className="deck-content">
      <div className="deck-curve">
        <div className="deck-curve-label">Кривая маны</div>
        <div className="deck-curve-bars">
          {manaCurve.map((n, i) => (
            <div
              key={i}
              className="deck-curve-bar-wrap"
              title={`${i === 7 ? '7+' : i} маны: ${n}`}
            >
              <div
                className="deck-curve-bar"
                style={{ height: `${(n / maxCurve) * 100}%` }}
              />
              <div className="deck-curve-bar-label">{i === 7 ? '7+' : i}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="deck-list">
        {grouped.length === 0 && (
          <div className="deck-list-empty">
            Кликните по карте слева, чтобы добавить её в колоду
          </div>
        )}
        {grouped.map(({ card, count }) => (
          <div
            key={card!.id}
            className={`deck-item deck-item-rarity-${card!.rarity}`}
          >
            <div className="deck-item-cost">{card!.cost}</div>
            <div className="deck-item-name">{card!.name}</div>
            <div className="deck-item-count">×{count}</div>
            <div className="deck-item-actions">
              <button
                className="deck-item-btn"
                onClick={() => onRemove(card!.id)}
              >
                −
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}