import { useMemo, useState } from 'react';
import { listPacks, listActiveDecks, getCards, seriesOfDeck } from '@aspects/cards'
import type { DeckDto } from '@aspects/shared';
import { generateRandomDeck } from '@aspects/shared';
import type { AuthState } from '../game/useAuth';
import { CostCurve } from './CostCurve';
import { BOT_PROFILES, BOT_LEVELS, botName } from '@aspects/bot';

export interface StartParams {
  series: string[];
  deckP1Id: string;
  deckP2Id: string;
  deckP1Cards: string[] | null;
  deckP2Cards: string[] | null;
  p1BotName: string | null;
  p2BotName: string | null;
  observe: boolean;
}

interface Props {
  initial: Partial<StartParams>;
  auth: AuthState;
  savedDecks: DeckDto[];
  onBack: () => void;
  onStart: (params: StartParams) => void;
}

type DeckChoice =
  | { kind: 'preset'; id: string }
  | { kind: 'saved'; id: string }
  | { kind: 'random'; cards: string[]; series: string[] };

function choiceKey(c: DeckChoice): string {
  if (c.kind === 'random') return 'random';
  return `${c.kind}:${c.id}`;
}

// ─── Player block (без изменений) ───

interface PlayerBlockProps {
  side: 'p1' | 'p2';
  label: string;
  isBot: boolean;
  botProfile: string;
  botLevel: string;
  onChangeIsBot: (v: boolean) => void;
  onChangeProfile: (v: string) => void;
  onChangeLevel: (v: string) => void;
}

function PlayerBlock(p: PlayerBlockProps) {
  return (
    <div className={`player-config player-config-${p.side}`}>
      <div className="player-config-header">
        <div className="player-config-name">{p.label}</div>
        <div className="mode-toggle">
          <button
            className={`mode-toggle-btn ${!p.isBot ? 'mode-toggle-btn-active' : ''}`}
            onClick={() => p.onChangeIsBot(false)}
          >
            👤 Человек
          </button>
          <button
            className={`mode-toggle-btn ${p.isBot ? 'mode-toggle-btn-active' : ''}`}
            onClick={() => p.onChangeIsBot(true)}
          >
            🤖 Бот
          </button>
        </div>
      </div>

      {p.isBot && (
        <div className="bot-config">
          <div>
            <div className="bot-config-label">Стиль</div>
            <div className="bot-grid">
              {BOT_PROFILES.map((prof) => (
                <div
                  key={prof.id}
                  className={`bot-option ${p.botProfile === prof.id ? 'bot-option-active' : ''}`}
                  onClick={() => p.onChangeProfile(prof.id)}
                  title={prof.desc}
                >
                  {prof.name}
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="bot-config-label">Сложность</div>
            <div className="bot-grid bot-grid-2">
              {BOT_LEVELS.map((l) => (
                <div
                  key={l.id}
                  className={`bot-option ${p.botLevel === l.id ? 'bot-option-active' : ''}`}
                  onClick={() => p.onChangeLevel(l.id)}
                >
                  <span className="bot-option-name">{l.name}</span>
                  <span className="bot-option-wr">{l.winrate}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Deck chooser ───

interface DeckChooserProps {
  side: 'p1' | 'p2';
  savedDecks: DeckDto[];
  value: DeckChoice | null;
  onChange: (c: DeckChoice) => void;
  onRandom: () => void;
  cardIds: string[];
  series: string[];
}

function DeckChooser({
  side,
  savedDecks,
  value,
  onChange,
  onRandom,
  cardIds,
  series,
}: DeckChooserProps) {
  const presets = listActiveDecks();
  const currentKey = value ? choiceKey(value) : '';

  return (
    <div className="deck-chooser">
      <button
        className={`deck-random-btn ${value?.kind === 'random' ? 'deck-random-btn-active' : ''}`}
        onClick={onRandom}
        title="Случайная колода"
      >
        🎲 Случайная колода
      </button>

      <div className="deck-group">
        <div className="deck-group-title">📦 Пресеты</div>
        {presets.map((d) => {
          const key = `preset:${d.id}`;
          const isSelected = currentKey === key;
          return (
            <div
              key={d.id}
              className={`deck-option ${isSelected ? `deck-option-${side}-selected` : ''}`}
              onClick={() => onChange({ kind: 'preset', id: d.id })}
            >
              <div className="deck-option-name">{d.name}</div>
              {d.description && (
                <div className="deck-option-desc">{d.description}</div>
              )}
            </div>
          );
        })}
      </div>

      {savedDecks.length > 0 && (
        <div className="deck-group">
          <div className="deck-group-title">
            🃏 Мои колоды ({savedDecks.length})
          </div>
          {savedDecks.map((d) => {
            const key = `saved:${d.id}`;
            const isSelected = currentKey === key;
            return (
              <div
                key={d.id}
                className={`deck-option deck-option-custom ${isSelected ? `deck-option-${side}-selected` : ''}`}
                onClick={() => onChange({ kind: 'saved', id: d.id })}
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

      {cardIds.length > 0 && series.length > 0 && (
        <div>
          <div className="deck-group-title" style={{ marginTop: 8 }}>
            Кривая маны
          </div>
          <CostCurve cardIds={cardIds} series={series} compact />
        </div>
      )}
    </div>
  );
}

// ─── Main ───

export function SetupScreen({
  initial,
  savedDecks,
  onBack,
  onStart,
}: Props) {
  const [p1Deck, setP1Deck] = useState<DeckChoice | null>(() => {
    if (initial.deckP1Id) return { kind: 'preset', id: initial.deckP1Id };
    const ds = listActiveDecks();
    return ds[0] ? { kind: 'preset', id: ds[0].id } : null;
  });

  const [p2Deck, setP2Deck] = useState<DeckChoice | null>(() => {
    if (initial.deckP2Id) return { kind: 'preset', id: initial.deckP2Id };
    const ds = listActiveDecks();
    return ds[1]
      ? { kind: 'preset', id: ds[1].id }
      : ds[0]
        ? { kind: 'preset', id: ds[0].id }
        : null;
  });

  const [p1IsBot, setP1IsBot] = useState(initial.p1BotName != null);
  const [p2IsBot, setP2IsBot] = useState(initial.p2BotName != null);
  const [p1BotProfile, setP1BotProfile] = useState('balanced');
  const [p1BotLevel, setP1BotLevel] = useState('master');
  const [p2BotProfile, setP2BotProfile] = useState('balanced');
  const [p2BotLevel, setP2BotLevel] = useState('master');
  const [observe, setObserve] = useState(initial.observe ?? false);

  const atLeastOneBot = p1IsBot || p2IsBot;
  const bothBots = p1IsBot && p2IsBot;
  const canStart = !!p1Deck && !!p2Deck;

  const resolveCards = (choice: DeckChoice | null): string[] | null => {
    if (!choice) return null;
    if (choice.kind === 'random') return choice.cards;
    if (choice.kind === 'saved') {
      const found = savedDecks.find((d) => d.id === choice.id);
      return found ? found.cardIds : null;
    }
    const p = listActiveDecks().find((x) => x.id === choice.id);
    return p?.cards ?? null;
  };

  const cardIdsFor = useMemo(
    () => (choice: DeckChoice | null): string[] => {
      if (!choice) return [];
      if (choice.kind === 'random') return choice.cards;
      if (choice.kind === 'saved') {
        return savedDecks.find((d) => d.id === choice.id)?.cardIds ?? [];
      }
      const d = listActiveDecks().find((x) => x.id === choice.id);
      return d?.cards ?? [];
    },
    [savedDecks],
  );

  const seriesFor = useMemo(
    () => (choice: DeckChoice | null): string[] => {
      if (!choice) return [];
      if (choice.kind === 'random') return choice.series;
      const cardIds = cardIdsFor(choice);
      return seriesOfDeck(cardIds);
    },
    [cardIdsFor],
  );

  const handleRandom = (setter: (c: DeckChoice) => void) => {
    const packs = listPacks();
    const shuffled = [...packs].sort(() => Math.random() - 0.5);
    const s = shuffled.slice(0, 4).map((p) => p.id);
    const allCards = s.flatMap((id) => {
      try {
        return getCards(id);
      } catch {
        return [];
      }
    });
    const unique = [...new Map(allCards.map((c) => [c.id, c])).values()];
    const ids = generateRandomDeck(unique, { size: 30 });
    if (ids) setter({ kind: 'random', cards: ids, series: s });
  };

  const handleStart = () => {
    if (!p1Deck || !p2Deck) return;
    const p1Id = p1Deck.kind === 'random' ? 'random' : p1Deck.id;
    const p2Id = p2Deck.kind === 'random' ? 'random' : p2Deck.id;
    const p1Series = seriesFor(p1Deck);
    const p2Series = seriesFor(p2Deck);
    const merged = [...new Set([...p1Series, ...p2Series])];

    onStart({
      series: merged,
      deckP1Id: p1Id,
      deckP2Id: p2Id,
      deckP1Cards: resolveCards(p1Deck),
      deckP2Cards: resolveCards(p2Deck),
      p1BotName: p1IsBot ? botName(p1BotProfile, p1BotLevel) : null,
      p2BotName: p2IsBot ? botName(p2BotProfile, p2BotLevel) : null,
      observe: atLeastOneBot && observe,
    });
  };

  return (
    <div className="page-screen">
      <div className="page-card">
        <div className="page-header">
          <button className="page-header-back" onClick={onBack}>
            ← Профиль
          </button>
          <h1 className="page-header-title">Новая игра</h1>
        </div>

        <div className="page-section">
          <div className="page-tiles" style={{ gap: 16 }}>
            <div>
              <PlayerBlock
                side="p1"
                label="Игрок 1"
                isBot={p1IsBot}
                botProfile={p1BotProfile}
                botLevel={p1BotLevel}
                onChangeIsBot={setP1IsBot}
                onChangeProfile={setP1BotProfile}
                onChangeLevel={setP1BotLevel}
              />
              <DeckChooser
                side="p1"
                savedDecks={savedDecks}
                value={p1Deck}
                onChange={setP1Deck}
                onRandom={() => handleRandom(setP1Deck)}
                cardIds={cardIdsFor(p1Deck)}
                series={seriesFor(p1Deck)}
              />
            </div>

            <div>
              <PlayerBlock
                side="p2"
                label="Игрок 2"
                isBot={p2IsBot}
                botProfile={p2BotProfile}
                botLevel={p2BotLevel}
                onChangeIsBot={setP2IsBot}
                onChangeProfile={setP2BotProfile}
                onChangeLevel={setP2BotLevel}
              />
              <DeckChooser
                side="p2"
                savedDecks={savedDecks}
                value={p2Deck}
                onChange={setP2Deck}
                onRandom={() => handleRandom(setP2Deck)}
                cardIds={cardIdsFor(p2Deck)}
                series={seriesFor(p2Deck)}
              />
            </div>
          </div>
        </div>

        {atLeastOneBot && (
          <div className="page-section setup-observe">
            <label className="setup-checkbox">
              <input
                type="checkbox"
                checked={observe}
                onChange={(e) => setObserve(e.target.checked)}
              />
              <span>
                Режим наблюдения: показывать руки обоих игроков и замедлить бота
              </span>
            </label>
            {bothBots && (
              <div className="setup-observe-hint">
                Оба игрока — боты. Партия будет проигрываться автоматически.
              </div>
            )}
          </div>
        )}

        <button
          className="setup-start"
          disabled={!canStart}
          onClick={handleStart}
        >
          {bothBots ? '▶ Запустить бой ботов' : 'Начать партию'}
        </button>
      </div>
    </div>
  );
}