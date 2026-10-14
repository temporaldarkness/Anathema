import { useMemo, useState } from 'react';
import { getDecks, listPacks } from '@aspects/cards';
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

type DeckValue = { kind: 'preset'; id: string } | { kind: 'saved'; id: string };

function packName(id: string): string {
  return PACKS.find((p) => p.id === id)?.name ?? id;
}

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function MatchmakingScreen({ auth, savedDecks, onBack, onMatched }: Props) {
  const [packId, setPackId] = useState(PACKS[0].id);
  const [deck, setDeck] = useState<DeckValue>(() => {
    const ds = getDecks(PACKS[0].id);
    return ds[0] ? { kind: 'preset', id: ds[0].id } : { kind: 'preset', id: '' };
  });
  const [localError, setLocalError] = useState<string | null>(null);

  const { state, enqueue, cancel } = useMatchmaking({ onMatched });

  const presets = getDecks(packId);
  const savedForPack = useMemo(
    () => savedDecks.filter((d) => !d.packId || d.packId === packId),
    [savedDecks, packId],
  );

  const resolvedDeckCards = useMemo((): string[] => {
    if (deck.kind === 'saved') {
      return savedDecks.find((d) => d.id === deck.id)?.cardIds ?? [];
    }
    const p = getDecks(packId).find((d) => d.id === deck.id);
    return p?.cards ?? [];
  }, [deck, savedDecks, packId]);

  const handlePackChange = (newPackId: string) => {
    setPackId(newPackId);
    const ds = getDecks(newPackId);
    if (ds[0]) setDeck({ kind: 'preset', id: ds[0].id });
  };

  const handleFind = () => {
    setLocalError(null);
    if (resolvedDeckCards.length !== 30) {
      setLocalError('Выбранная колода должна содержать ровно 30 карт');
      return;
    }
    const deckId = deck.kind === 'preset' ? `preset:${deck.id}` : `saved:${deck.id}`;
    enqueue(packId, deckId, resolvedDeckCards);
  };

  // ─── Ожидание ───

  if (state.kind === 'queued' || state.kind === 'matched' || state.kind === 'loading') {
    const elapsed = state.kind === 'queued' ? state.elapsedMs : 0;
    const position = state.kind === 'queued' ? state.status.position : null;
    const total = state.kind === 'queued' ? state.status.totalInPack : null;

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
              Пак: <b>{packName(packId)}</b>
              {state.kind === 'queued' && (
                <>
                  {' · '}
                  {formatDuration(elapsed)}
                </>
              )}
            </div>
            {position !== null && total !== null && (
              <div className="mm-search-hint">
                {total <= 1
                  ? 'Вы единственный в очереди на этот пак'
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
          <div className="page-section-title">Набор карт</div>
          <div className="pack-grid">
            {PACKS.map((p) => (
              <div
                key={p.id}
                className={`pack-tile ${packId === p.id ? 'pack-tile-selected' : ''}`}
                onClick={() => handlePackChange(p.id)}
              >
                <div className="pack-tile-name">{p.name}</div>
                <div className="pack-tile-desc">{p.description}</div>
                <div className="pack-tile-meta">
                  {getDecks(p.id).length} колод
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="page-section">
          <div className="page-section-title">Ваша колода</div>
          <div className="deck-chooser">
            <div className="deck-group">
              <div className="deck-group-title">📦 Пресеты</div>
              {presets.map((d) => {
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

            {savedForPack.length > 0 && (
              <div className="deck-group">
                <div className="deck-group-title">
                  🃏 Мои колоды ({savedForPack.length})
                </div>
                {savedForPack.map((d) => {
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

            {resolvedDeckCards.length > 0 && (
              <div>
                <div className="deck-group-title" style={{ marginTop: 8 }}>
                  Кривая маны
                </div>
                <CostCurve
                  cardIds={resolvedDeckCards}
                  packId={packId}
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
          disabled={resolvedDeckCards.length !== 30}
        >
          🔍 Найти соперника
        </button>
      </div>
    </div>
  );
}