import { useMemo, useState } from 'react';
import { listActiveDecks, listPacks, getCards, seriesOfDeck } from '@aspects/cards';
import { generateRandomDeck } from '@aspects/shared';
import type { DeckDto } from '@aspects/shared';
import type { AuthState } from '../game/useAuth';
import { useMatchmaking } from '../game/useMatchmaking';
import { CostCurve } from './CostCurve';

interface Props {
  auth: AuthState;
  savedDecks: DeckDto[];
  onBack: () => void;
  onMatched: (roomCode: string, opponentName: string) => void;
}

const PACKS = listPacks();

type DeckValue =
  | { kind: 'preset'; id: string }
  | { kind: 'saved'; id: string }
  | { kind: 'random'; cards: string[]; series: string[] };

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function randomSeries(): string[] {
  const shuffled = [...PACKS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 4).map((p) => p.id);
}

export function MatchmakingScreen({ auth, savedDecks, onBack, onMatched }: Props) {
  const allPresets = useMemo(() => listActiveDecks(), []);
  const [deck, setDeck] = useState<DeckValue>(() =>
    allPresets[0]
      ? { kind: 'preset', id: allPresets[0].id }
      : { kind: 'preset', id: '' },
  );
  const [localError, setLocalError] = useState<string | null>(null);

  const { state, enqueue, cancel } = useMatchmaking({ onMatched });

  const resolved = useMemo((): {
    cardIds: string[];
    series: string[];
  } => {
    if (deck.kind === 'saved') {
      const d = savedDecks.find((x) => x.id === deck.id);
      return {
        cardIds: d?.cardIds ?? [],
        series: d?.series ?? [],
      };
    }
    if (deck.kind === 'random') {
      return { cardIds: deck.cards, series: deck.series };
    }
    const p = allPresets.find((x) => x.id === deck.id);
    if (!p) return { cardIds: [], series: [] };
    return { cardIds: p.cards, series: seriesOfDeck(p.cards) };
  }, [deck, savedDecks, allPresets]);

  const handleRandom = () => {
    const s = randomSeries();
    const allCards = s.flatMap((id) => {
      try {
        return getCards(id);
      } catch {
        return [];
      }
    });
    const unique = [
      ...new Map(allCards.map((c) => [c.id, c])).values(),
    ];
    const ids = generateRandomDeck(unique, { size: 30 });
    if (!ids) {
      setLocalError('Не удалось сгенерировать колоду');
      return;
    }
    setDeck({ kind: 'random', cards: ids, series: s });
  };

  const handleFind = () => {
    setLocalError(null);
    if (resolved.cardIds.length !== 30) {
      setLocalError('Выбранная колода должна содержать ровно 30 карт');
      return;
    }
    if (resolved.series.length === 0) {
      setLocalError('Не удалось определить серии колоды');
      return;
    }
    if (resolved.series.length > 4) {
      setLocalError('Колода использует больше 4 серий — недопустимо');
      return;
    }
    const deckId =
      deck.kind === 'preset'
        ? `preset:${deck.id}`
        : deck.kind === 'saved'
          ? `saved:${deck.id}`
          : 'random';
    enqueue(resolved.series, deckId, resolved.cardIds);
  };

  // ─── Ожидание ───

  if (state.kind === 'queued' || state.kind === 'matched' || state.kind === 'loading') {
    const elapsed = state.kind === 'queued' ? state.elapsedMs : 0;
    const position = state.kind === 'queued' ? state.status.position : null;
    const total = state.kind === 'queued' ? state.status.totalInQueue : null;

    return (
      <div className="page-screen">
        <div className="page-card page-card-narrow">
          <div className="page-header">
            <button
              className="page-header-back"
              onClick={() => {
                cancel();
                onBack();
              }}
            >
              ← Отменить
            </button>
            <h1 className="page-header-title">Поиск соперника</h1>
          </div>

          <div className="mm-search">
            <div className="mm-search-spinner" />
            <div className="mm-search-title">
              {state.kind === 'matched'
                ? state.opponentIsBot
                  ? `Найден бот: ${state.opponentName}`
                  : `Найден соперник: ${state.opponentName}`
                : elapsed > 10_000
                  ? 'Расширяем поиск…'
                  : 'Ищем соперника…'}
            </div>
            <div className="mm-search-meta">
              {state.kind === 'queued' && <>В очереди: {formatDuration(elapsed)}</>}
            </div>
            {position !== null && total !== null && (
              <div className="mm-search-hint">
                {total <= 1
                  ? 'Вы единственный в очереди'
                  : `Позиция в очереди: ${position} из ${total}`}
              </div>
            )}
            <div className="mm-search-actions">
              <button
                className="btn-header"
                onClick={() => {
                  cancel();
                  onBack();
                }}
              >
                Отменить поиск
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Форма ───

  const errText = localError ?? (state.kind === 'error' ? state.reason : null);

  return (
    <div className="page-screen">
      <div className="page-card">
        <div className="page-header">
          <button className="page-header-back" onClick={onBack}>
            ← Профиль
          </button>
          <h1 className="page-header-title">Быстрая игра</h1>
        </div>

        <div className="page-section">
          <div className="page-section-title">Ваша колода</div>
          <div className="deck-chooser">
            <button
              className={`deck-random-btn ${deck.kind === 'random' ? 'deck-random-btn-active' : ''}`}
              onClick={handleRandom}
              title="Случайная колода из 4 случайных серий"
            >
              🎲 Случайная колода
            </button>

            {allPresets.length > 0 && (
              <div className="deck-group">
                <div className="deck-group-title">📦 Пресеты</div>
                {allPresets.map((d) => {
                  const active = deck.kind === 'preset' && deck.id === d.id;
                  return (
                    <div
                      key={d.id}
                      className={`deck-option ${active ? 'deck-option-p1-selected' : ''}`}
                      onClick={() => setDeck({ kind: 'preset', id: d.id })}
                    >
                      <div className="deck-option-name">{d.name}</div>
                      {d.description && (
                        <div className="deck-option-desc">{d.description}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {savedDecks.length > 0 && (
              <div className="deck-group">
                <div className="deck-group-title">
                  🃏 Мои колоды ({savedDecks.length})
                </div>
                {savedDecks.map((d) => {
                  const active = deck.kind === 'saved' && deck.id === d.id;
                  return (
                    <div
                      key={d.id}
                      className={`deck-option deck-option-custom ${active ? 'deck-option-p1-selected' : ''}`}
                      onClick={() => setDeck({ kind: 'saved', id: d.id })}
                    >
                      <div className="deck-option-name">{d.name}</div>
                      <div className="deck-option-desc">
                        {d.cardIds.length} карт · сохранённая
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {resolved.cardIds.length > 0 && resolved.series.length > 0 && (
              <div>
                <div className="deck-group-title" style={{ marginTop: 8 }}>
                  Кривая маны
                </div>
                <CostCurve
                  cardIds={resolved.cardIds}
                  series={resolved.series}
                  compact
                />
              </div>
            )}
          </div>
        </div>

        {errText && (
          <div className="decks-error" style={{ marginBottom: 12 }}>
            {errText}
          </div>
        )}

        <button
          className="setup-start"
          onClick={handleFind}
          disabled={resolved.cardIds.length !== 30}
        >
          🔍 Найти соперника
        </button>
      </div>
    </div>
  );
}