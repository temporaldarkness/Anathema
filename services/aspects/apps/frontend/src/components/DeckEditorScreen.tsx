import { useMemo, useState, useEffect, useRef } from 'react';
import type { DeckDto, CreateDeckDto } from '@aspects/shared';
import { validateDeck, errorText } from '@aspects/shared';
import { getCards, listPacks, type CardDefinition } from '@aspects/cards';
import type { UseDecksResult } from '../game/useDecks';
import { HoverTooltip } from './HoverTooltip';
import { CardTooltipDef } from './CardTooltipDef';
import { generateRandomDeck } from '../game/randomDeck';

interface Props {
  deckId: string | null;
  deckStore: UseDecksResult;
  onBack: () => void;
}

const PACKS = listPacks();

interface DeckState {
  id: string | null;
  name: string;
  description: string;
  packId: string;
  cardIds: string[];
}

interface Toast {
  id: number;
  kind: 'warn' | 'error' | 'info';
  text: string;
}

function emptyDeck(packId: string): DeckState {
  return { id: null, name: '', description: '', packId, cardIds: [] };
}

function deckFromDto(dto: DeckDto): DeckState {
  return {
    id: dto.id,
    name: dto.name,
    description: dto.description,
    packId: dto.packId ?? 'azeroth',
    cardIds: [...dto.cardIds],
  };
}

export function DeckEditorScreen({ deckId, deckStore, onBack }: Props) {
  const [deck, setDeck] = useState<DeckState>(() => {
    if (deckId) {
      const found = deckStore.decks.find((d) => d.id === deckId);
      if (found) return deckFromDto(found);
    }
    return emptyDeck(PACKS[0].id);
  });
  const [saving, setSaving] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(0);

  useEffect(() => {
    if (!deckId) return;
    if (deck.id === deckId) return;
    const found = deckStore.decks.find((d) => d.id === deckId);
    if (found) setDeck(deckFromDto(found));
  }, [deckId, deckStore.decks, deck.id]);

  const packLocked = deck.cardIds.length > 0 && deck.id !== null;
  const allCards = useMemo(() => getCards(deck.packId), [deck.packId]);

  const validation = useMemo(
    () => validateDeck(deck.cardIds, allCards),
    [deck.cardIds, allCards],
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

  const handleAddCard = (card: CardDefinition) => {
    if (deck.cardIds.length >= 30) {
      pushToast('warn', 'Колода полна: 30/30');
      return;
    }
    const tag = card.personalityTag;
    const already = personalityCounts.get(tag) ?? 0;
    if (already >= 5) {
      pushToast('warn', `Уже 5 копий личности: ${card.name}`);
      return;
    }
    if (card.rarity === 'legendary') {
      const count = deck.cardIds.filter((id) => id === card.id).length;
      if (count >= 1) {
        pushToast('warn', `Легендарка уже добавлена: ${card.name}`);
        return;
      }
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

  const handleRandom = () => {
    if (deck.cardIds.length > 0) {
      if (!confirm('Заменить текущую колоду случайной?')) return;
    }
    const ids = generateRandomDeck(deck.packId);
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
    if (!validation.valid) {
      pushToast('error', validation.errors.map(errorText).join('; '));
      return;
    }
    setSaving(true);

    const dto: CreateDeckDto = {
      name: deck.name.trim(),
      description: deck.description.trim() || undefined,
      packId: deck.packId,
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
        <select
          className="deck-editor-pack"
          value={deck.packId}
          onChange={(e) =>
            setDeck({ ...deck, packId: e.target.value, cardIds: [] })
          }
          disabled={packLocked}
          title={
            packLocked
              ? 'Нельзя сменить пак у сохранённой колоды'
              : 'Пак определяет доступные карты'
          }
        >
          {PACKS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
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
        />
        <DeckContent
          deck={deck}
          allCards={allCards}
          onRemove={handleRemoveCard}
        />
      </div>

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

interface CardPoolProps {
  deck: DeckState;
  allCards: CardDefinition[];
  personalityCounts: Map<string, number>;
  onAdd: (card: CardDefinition) => void;
}

function CardPool({ deck, allCards, personalityCounts, onAdd }: CardPoolProps) {
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