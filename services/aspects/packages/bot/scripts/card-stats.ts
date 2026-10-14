#!/usr/bin/env tsx
/**
 * Реальная статистика по картам — v2.
 *
 * Использование:
 *   card-stats <packId> <N> [botName]
 *
 * Пример:
 *   card-stats azeroth 200
 *   card-stats azeroth 500 heuristic-v4
 *
 * Ключевая метрика — Δ (delta):
 *   Δ = winrate_when_played − winrate_when_drawn_not_played
 *
 * Это устраняет базовый winrate колоды и отвечает на вопрос:
 * «если карта попала в руку — насколько лучше её РАЗЫГРАТЬ, чем НЕ разыграть?»
 *
 * Δ > +3pp  → карта ценится (или win-more)
 * Δ ≈ 0    → нейтральна
 * Δ < −3pp  → карта вредит (или играется от отчаяния)
 * playRate < 15% → мёртвый груз
 */

import {
  createGame,
  applyCommand,
  type GameState,
  type Command,
  type PlayerId,
} from '@aspects/engine';
import { getPack, getDecks } from '@aspects/cards';
import { makeBot } from '../src/bot-factory';
import { pickResponder } from '../src/responder';
import type { Bot } from '../src/types';

// ─────────────────────────── CLI ────────────────────────────

interface Args {
  packId: string;
  n: number;
  botName: string;
  minSamples: number;
  minPlayRateForDead: number;
}

function parseArgs(argv: string[]): Args {
  const [packId = 'azeroth', nStr = '200', botName = 'heuristic-v4'] = argv;
  const n = Number.parseInt(nStr, 10);
  if (!Number.isFinite(n) || n <= 0) {
    console.error(`Invalid N: ${nStr}`);
    process.exit(1);
  }
  return {
    packId,
    n,
    botName,
    minSamples: 20,
    minPlayRateForDead: 0.15,
  };
}

// ─────────────────────────── Structures ────────────────────────────

interface CardAcc {
  deckId: string;
  defId: string;
  drawn: number;
  winsAfterDraw: number;
  played: number;
  winsAfterPlay: number;
}

interface DeckAcc {
  appearances: number;
  wins: number;
}

interface GameSummary {
  p1DeckId: string;
  p2DeckId: string;
  winner: PlayerId | null;
  p1Drawn: Set<string>;
  p1Played: Set<string>;
  p2Drawn: Set<string>;
  p2Played: Set<string>;
}

function ensureCard(
  map: Map<string, CardAcc>,
  deckId: string,
  defId: string,
): CardAcc {
  const k = `${deckId}|${defId}`;
  let s = map.get(k);
  if (!s) {
    s = { deckId, defId, drawn: 0, winsAfterDraw: 0, played: 0, winsAfterPlay: 0 };
    map.set(k, s);
  }
  return s;
}

// ─────────────────────────── Game runner ────────────────────────────

function collectHandDefIds(state: GameState, p: PlayerId): Set<string> {
  const out = new Set<string>();
  for (const id of state.players[p].hand) {
    const c = state.cards[id];
    if (c) out.add(c.definitionId);
  }
  return out;
}

function absorbHand(state: GameState, p: PlayerId, into: Set<string>): void {
  for (const id of state.players[p].hand) {
    const c = state.cards[id];
    if (c) into.add(c.definitionId);
  }
}

function noteCommand(
  state: GameState,
  cmd: Command,
  played: Record<PlayerId, Set<string>>,
  drawn: Record<PlayerId, Set<string>>,
): void {
  if (cmd.type === 'PLAY_CARD' || cmd.type === 'REPLACE_CARD') {
    const c = state.cards[cmd.cardId];
    if (!c) return;
    played[cmd.playerId].add(c.definitionId);
    // То, что играется, точно было в руке.
    drawn[cmd.playerId].add(c.definitionId);
  }
}

function playGame(
  pack: ReturnType<typeof getPack>,
  p1DeckId: string,
  p2DeckId: string,
  p1Cards: readonly string[],
  p2Cards: readonly string[],
  seed: string,
  makeBotFor: () => Bot,
): GameSummary {
  let state: GameState = createGame({
    seed,
    decks: { p1: p1Cards.slice(), p2: p2Cards.slice() },
    cardDefinitions: pack.cardsById,
    useMulligan: false,
  }).state;

  const bots: Record<PlayerId, Bot> = {
    p1: makeBotFor(),
    p2: makeBotFor(),
  };

  // Стартовые руки уже считаются «попали в руку».
  const drawn: Record<PlayerId, Set<string>> = {
    p1: collectHandDefIds(state, 'p1'),
    p2: collectHandDefIds(state, 'p2'),
  };
  const played: Record<PlayerId, Set<string>> = {
    p1: new Set(),
    p2: new Set(),
  };

  let steps = 0;
  while (!state.winner && steps < 2000) {
    const responder = pickResponder(state);
    if (responder === null) break;

    const cmd = bots[responder].chooseCommand(state, responder);
    if (cmd === null) break;

    noteCommand(state, cmd, played, drawn);

    const r = applyCommand(state, cmd);
    if (
      r.events.some(
        (e) => (e as { type?: string }).type === 'COMMAND_REJECTED',
      )
    ) {
      break;
    }
    state = r.state;

    // Подхватываем карты, попавшие в руку через эффекты (DRAW, RETURN_TO_HAND).
    absorbHand(state, 'p1', drawn.p1);
    absorbHand(state, 'p2', drawn.p2);

    steps++;
  }

  return {
    p1DeckId,
    p2DeckId,
    winner: state.winner ?? null,
    p1Drawn: drawn.p1,
    p1Played: played.p1,
    p2Drawn: drawn.p2,
    p2Played: played.p2,
  };
}

// ─────────────────────────── Aggregation ────────────────────────────

function aggregate(
  summary: GameSummary,
  cards: Map<string, CardAcc>,
  decks: Map<string, DeckAcc>,
): void {
  const { winner, p1DeckId, p2DeckId } = summary;
  if (!winner) return; // пропускаем незавершённые

  const sides: Array<{
    deckId: string;
    drawn: Set<string>;
    played: Set<string>;
    won: boolean;
  }> = [
    {
      deckId: p1DeckId,
      drawn: summary.p1Drawn,
      played: summary.p1Played,
      won: winner === 'p1',
    },
    {
      deckId: p2DeckId,
      drawn: summary.p2Drawn,
      played: summary.p2Played,
      won: winner === 'p2',
    },
  ];

  for (const side of sides) {
    // Deck baseline.
    let d = decks.get(side.deckId);
    if (!d) {
      d = { appearances: 0, wins: 0 };
      decks.set(side.deckId, d);
    }
    d.appearances++;
    if (side.won) d.wins++;

    // Карты.
    for (const defId of side.drawn) {
      const s = ensureCard(cards, side.deckId, defId);
      s.drawn++;
      if (side.won) s.winsAfterDraw++;
    }
    for (const defId of side.played) {
      const s = ensureCard(cards, side.deckId, defId);
      s.played++;
      if (side.won) s.winsAfterPlay++;
    }
  }
}

// ─────────────────────────── Reporting ────────────────────────────

interface Row {
  deckId: string;
  defId: string;
  name: string;
  cost: number;
  drawn: number;
  played: number;
  playRate: number;
  wrPlay: number;
  wrNoPlay: number;
  delta: number;
}

function buildRows(
  pack: ReturnType<typeof getPack>,
  cards: Map<string, CardAcc>,
  minSamples: number,
): Row[] {
  const rows: Row[] = [];
  for (const s of cards.values()) {
    if (s.drawn < minSamples) continue;
    if (s.played < minSamples) continue;
    const nNoPlay = s.drawn - s.played;
    if (nNoPlay < minSamples) continue;

    const wrPlay = s.winsAfterPlay / s.played;
    const winsNoPlay = s.winsAfterDraw - s.winsAfterPlay;
    const wrNoPlay = winsNoPlay / nNoPlay;
    const def = pack.cardsById[s.defId];

    rows.push({
      deckId: s.deckId,
      defId: s.defId,
      name: def?.name ?? s.defId,
      cost: def?.cost ?? 0,
      drawn: s.drawn,
      played: s.played,
      playRate: s.played / s.drawn,
      wrPlay,
      wrNoPlay,
      delta: wrPlay - wrNoPlay,
    });
  }
  return rows;
}

const pct = (x: number) => `${(x * 100).toFixed(1).padStart(5)}%`;
const pp = (x: number) =>
  (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + 'pp';

function printTable(rows: Row[]): void {
  const header =
    'deck'.padEnd(11) + ' ' +
    'card'.padEnd(28) + ' ' +
    'cost'.padStart(4) + ' ' +
    'drawn'.padStart(5) + ' ' +
    'played'.padStart(6) + ' ' +
    'pRate'.padStart(6) + ' ' +
    'wr_play'.padStart(7) + ' ' +
    'wr_no'.padStart(6) + ' ' +
    'Δ'.padStart(8);
  console.log(header);
  for (const r of rows) {
    console.log(
      r.deckId.padEnd(11) + ' ' +
      r.name.slice(0, 28).padEnd(28) + ' ' +
      String(r.cost).padStart(4) + ' ' +
      String(r.drawn).padStart(5) + ' ' +
      String(r.played).padStart(6) + ' ' +
      pct(r.playRate) + ' ' +
      pct(r.wrPlay) + ' ' +
      pct(r.wrNoPlay) + ' ' +
      pp(r.delta).padStart(8),
    );
  }
}

// ─────────────────────────── Main ────────────────────────────

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const pack = getPack(args.packId);
  const decks = getDecks(args.packId);

  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Card stats — pack=${args.packId}, bot=${args.botName}, N/pair=${args.n}`);
  console.log('═══════════════════════════════════════════════════════════════');

  const cards = new Map<string, CardAcc>();
  const deckAcc = new Map<string, DeckAcc>();

  const pairs: Array<[string, string]> = [];
  for (const a of decks) for (const b of decks) pairs.push([a.id, b.id]);

  const totalGames = pairs.length * args.n;
  let done = 0;
  const t0 = Date.now();

  for (const [aId, bId] of pairs) {
    const a = decks.find((d) => d.id === aId)!;
    const b = decks.find((d) => d.id === bId)!;

    for (let i = 0; i < args.n; i++) {
      const seed = `cardstats-${aId}-${bId}-${i}`;
      const summary = playGame(
        pack,
        aId, bId,
        a.cards as string[],
        b.cards as string[],
        seed,
        () => makeBot(args.botName),
      );
      aggregate(summary, cards, deckAcc);

      done++;
      if (done % 100 === 0 || done === totalGames) {
        process.stdout.write(`\r  running ${done}/${totalGames} …          `);
      }
    }
  }
  process.stdout.write('\r');
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  // ── Baseline.
  console.log('\n─── Baseline по колодам ───────────────────────────────────────');
  const sortedDecks = [...deckAcc.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [id, s] of sortedDecks) {
    const wr = ((s.wins / s.appearances) * 100).toFixed(1);
    console.log(
      `  ${id.padEnd(12)}  games=${String(s.appearances).padStart(5)}  ` +
      `winrate=${wr.padStart(5)}%`,
    );
  }

  const rows = buildRows(pack, cards, args.minSamples);
  rows.sort((a, b) => b.delta - a.delta);

  // ── Top "good" cards.
  console.log('\n─── Топ 15 «ценных» карт (Δ > 0) ──────────────────────────────');
  printTable(rows.slice(0, 15));

  // ── Bottom "bad" cards.
  console.log('\n─── Топ 15 «проблемных» карт (Δ < 0) ──────────────────────────');
  printTable(rows.slice(-15).reverse());

  // ── Dead cards.
  const dead = rows
    .filter((r) => r.playRate < args.minPlayRateForDead)
    .sort((a, b) => a.playRate - b.playRate);

  console.log('\n─── «Мёртвый груз» (playRate < 15%) ───────────────────────────');
  if (dead.length === 0) {
    console.log('  (нет)');
  } else {
    printTable(dead.slice(0, 20));
  }

  // ── Читательская интерпретация.
  console.log('\n─── Как читать ────────────────────────────────────────────────');
  console.log('  Δ >  +8pp   — сильный сигнал «карта ценна»');
  console.log('  Δ    +3..+8pp — умеренный сигнал');
  console.log('  Δ    −3..+3pp — в пределах шума (или карта ситуативная)');
  console.log('  Δ    −8..−3pp — карта чаще играется в проигранных партиях');
  console.log('  Δ <  −8pp   — карта устойчиво коррелирует с поражениями');
  console.log('  playRate < 15% — мёртвый груз в руке');
  console.log('');
  console.log('  ВНИМАНИЕ: корреляция, не причинность. Win-more карты будут');
  console.log('  иметь высокий Δ; comeback-карты — низкий. Смотри на cost,');
  console.log('  деckId и контекст, прежде чем делать выводы.');

  console.log(`\nГотово за ${elapsed}s.`);
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}