#!/usr/bin/env tsx
/**
 * Статистика по картам в рамках scope.
 *
 * Δ = winrate_when_played − winrate_when_drawn_not_played.
 *
 * Usage:
 *   card-stats <scope> <N> [botName] [deck1,deck2,...] [flags]
 *
 * Flags:
 *   --mulligan              Включить муллиган
 *   --all                   Вывести полный список карт
 *   --card <id|name>        Детали по конкретной карте (по id или имени)
 *   --sort <field>          Сортировка: delta | playRate | cost | medianTurn | drawn | played
 *   --min-samples N         Порог сэмплов (default 20)
 *
 * Примеры:
 *   card-stats main 100
 *   card-stats main 100 --all
 *   card-stats main 100 --all --sort playRate
 *   card-stats main 100 --card classic_hacker
 *   card-stats main 100 --card "Ростовчанин"
 *   card-stats main 100 --all --min-samples 5 --sort medianTurn
 */

import type { GameState, Command, GameEvent, CardInstanceId, PlayerId } from '@aspects/engine';
import type { CardDefinition } from '@aspects/cards';
import { decksForScope, resolveScope, listScopes, cardsForScope } from '@aspects/cards';
import { makeBot, listAllBotIds } from '@aspects/bot';
import { runOneGame } from '../src/runner';

const DEFAULT_BOT = 'heuristic-v5-balanced-master';

type SortField = 'delta' | 'playRate' | 'cost' | 'medianTurn' | 'drawn' | 'played';

interface Args {
  scopeStr: string;
  series: string[];
  n: number;
  botName: string;
  deckIds: string[];
  useMulligan: boolean;
  minSamples: number;
  minPlayRateForDead: number;
  all: boolean;
  cardLookup: string | null;
  sortBy: SortField;
}

function parseArgs(argv: string[]): Args {
  const cleaned: string[] = [];
  let useMulligan = false;
  let all = false;
  let cardLookup: string | null = null;
  let sortBy: SortField = 'delta';
  let minSamples = 20;
  let minPlayRateForDead = 0.15;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--mulligan') {
      useMulligan = true;
    } else if (a === '--all') {
      all = true;
    } else if (a === '--card') {
      cardLookup = argv[++i] ?? null;
    } else if (a === '--sort') {
      const v = argv[++i];
      if (v === 'delta' || v === 'playRate' || v === 'cost' || v === 'medianTurn' || v === 'drawn' || v === 'played') {
        sortBy = v;
      } else {
        console.error(`Invalid --sort: "${v}". Use delta | playRate | cost | medianTurn | drawn | played`);
        process.exit(1);
      }
    } else if (a === '--min-samples') {
      minSamples = Number.parseInt(argv[++i], 10);
      if (!Number.isFinite(minSamples) || minSamples < 1) {
        console.error('Invalid --min-samples');
        process.exit(1);
      }
    } else {
      cleaned.push(a);
    }
  }

  const [scopeStr, nStr, arg3, arg4] = cleaned;
  if (!scopeStr || !nStr) {
    console.error(
      'Usage: card-stats <scope> <N> [botName] [deck1,deck2,...] [--mulligan] [--all] [--card <id|name>] [--sort <field>] [--min-samples N]',
    );
    process.exit(1);
  }
  const series = resolveScope(scopeStr);
  if (series.length === 0) {
    console.error(`Empty scope "${scopeStr}". Known: ${listScopes().map((s) => s.id).join(', ')}`);
    process.exit(1);
  }
  const n = Number.parseInt(nStr, 10);
  if (!Number.isFinite(n) || n <= 0) {
    console.error(`Invalid N: ${nStr}`);
    process.exit(1);
  }

  const botIds = listAllBotIds();
  let botName = DEFAULT_BOT;
  let decksArg: string | undefined;
  if (arg3 === undefined) {
    // ничего
  } else if (arg3.includes(',')) {
    decksArg = arg3;
  } else {
    if (!botIds.includes(arg3)) {
      console.error(`Unknown bot "${arg3}". Known: ${botIds.join(', ')}`);
      process.exit(1);
    }
    botName = arg3;
    decksArg = arg4;
  }
  const allIds = decksForScope(scopeStr).map((d) => d.id);
  const deckIds = decksArg
    ? decksArg.split(',').map((s) => s.trim()).filter(Boolean)
    : allIds;
  for (const id of deckIds) {
    if (!allIds.includes(id)) {
      console.error(`Unknown deck "${id}". Available: ${allIds.join(', ')}`);
      process.exit(1);
    }
  }

  return {
    scopeStr,
    series,
    n,
    botName,
    deckIds,
    useMulligan,
    minSamples,
    minPlayRateForDead,
    all,
    cardLookup,
    sortBy,
  };
}

// ─── Аккумуляторы ───

interface CardAcc {
  defId: string;
  drawn: number;
  winsAfterDraw: number;
  played: number;
  winsAfterPlay: number;
  turnSum: number;
  turns: number[];
}

function ensureCard(map: Map<string, CardAcc>, defId: string): CardAcc {
  let s = map.get(defId);
  if (!s) {
    s = { defId, drawn: 0, winsAfterDraw: 0, played: 0, winsAfterPlay: 0, turnSum: 0, turns: [] };
    map.set(defId, s);
  }
  return s;
}

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

function collectOneGame(
  series: string[],
  p1DeckId: string,
  p2DeckId: string,
  seed: string,
  botName: string,
  useMulligan: boolean,
): {
  drawn: Record<PlayerId, Set<string>>;
  played: Record<PlayerId, Set<string>>;
  turnOfPlay: Record<PlayerId, Map<string, number[]>>;
  winner: PlayerId | null;
} {
  const drawn: Record<PlayerId, Set<string>> = { p1: new Set(), p2: new Set() };
  const played: Record<PlayerId, Set<string>> = { p1: new Set(), p2: new Set() };
  const turnOfPlay: Record<PlayerId, Map<string, number[]>> = {
    p1: new Map(),
    p2: new Map(),
  };
  let initializedStartHands = false;

  const r = runOneGame(series, p1DeckId, p2DeckId, seed, {
    bots: { p1: makeBot(botName), p2: makeBot(botName) },
    useMulligan,
    onAfterCommand: (state, cmd, events) => {
      if (!initializedStartHands) {
        absorbHand(state, 'p1', drawn.p1);
        absorbHand(state, 'p2', drawn.p2);
        initializedStartHands = true;
      }

      if (cmd.type === 'PLAY_CARD' || cmd.type === 'REPLACE_CARD') {
        const c = state.cards[cmd.cardId];
        if (c) {
          played[cmd.playerId].add(c.definitionId);
          drawn[cmd.playerId].add(c.definitionId);
          const tm = turnOfPlay[cmd.playerId].get(c.definitionId) ?? [];
          tm.push(state.turnNumber);
          turnOfPlay[cmd.playerId].set(c.definitionId, tm);
        }
      }

      absorbHand(state, 'p1', drawn.p1);
      absorbHand(state, 'p2', drawn.p2);
    },
  });

  return {
    drawn,
    played,
    turnOfPlay,
    winner: r?.winner ?? null,
  };
}

function aggregateGame(
  info: ReturnType<typeof collectOneGame>,
  cards: Map<string, CardAcc>,
): void {
  if (!info.winner) return;
  const sides: Array<{ p: PlayerId; won: boolean }> = [
    { p: 'p1', won: info.winner === 'p1' },
    { p: 'p2', won: info.winner === 'p2' },
  ];
  for (const { p, won } of sides) {
    for (const defId of info.drawn[p]) {
      const s = ensureCard(cards, defId);
      s.drawn++;
      if (won) s.winsAfterDraw++;
    }
    for (const defId of info.played[p]) {
      const s = ensureCard(cards, defId);
      s.played++;
      if (won) s.winsAfterPlay++;
      const turns = info.turnOfPlay[p].get(defId) ?? [];
      for (const t of turns) {
        s.turnSum += t;
        s.turns.push(t);
      }
    }
  }
}

// ─── Reporting ───

interface Row {
  defId: string;
  name: string;
  cost: number;
  drawn: number;
  played: number;
  playRate: number;
  wrPlay: number;
  wrNoPlay: number;
  delta: number;
  medianTurn: number;
}

function buildRows(
  series: string[],
  cards: Map<string, CardAcc>,
  minSamples: number,
): Row[] {
  const cardDefs = cardsForScope(series);
  const rows: Row[] = [];
  for (const s of cards.values()) {
    if (s.drawn < minSamples) continue;
    if (s.played < minSamples) continue;
    const nNoPlay = s.drawn - s.played;
    if (nNoPlay < minSamples) continue;

    const wrPlay = s.winsAfterPlay / s.played;
    const winsNoPlay = s.winsAfterDraw - s.winsAfterPlay;
    const wrNoPlay = winsNoPlay / nNoPlay;
    const def = cardDefs[s.defId];

    const sortedTurns = [...s.turns].sort((a, b) => a - b);
    const medianTurn =
      sortedTurns.length % 2 === 0
        ? (sortedTurns[sortedTurns.length / 2 - 1] + sortedTurns[sortedTurns.length / 2]) / 2
        : sortedTurns[Math.floor(sortedTurns.length / 2)];

    rows.push({
      defId: s.defId,
      name: def?.name ?? s.defId,
      cost: def?.cost ?? 0,
      drawn: s.drawn,
      played: s.played,
      playRate: s.played / s.drawn,
      wrPlay,
      wrNoPlay,
      delta: wrPlay - wrNoPlay,
      medianTurn: medianTurn ?? 0,
    });
  }
  return rows;
}

function sortRows(rows: Row[], sortBy: SortField): Row[] {
  const sorted = [...rows];
  switch (sortBy) {
    case 'playRate':
      sorted.sort((a, b) => b.playRate - a.playRate);
      break;
    case 'cost':
      sorted.sort((a, b) => a.cost - b.cost || b.delta - a.delta);
      break;
    case 'medianTurn':
      sorted.sort((a, b) => a.medianTurn - b.medianTurn);
      break;
    case 'drawn':
      sorted.sort((a, b) => b.drawn - a.drawn);
      break;
    case 'played':
      sorted.sort((a, b) => b.played - a.played);
      break;
    case 'delta':
    default:
      sorted.sort((a, b) => b.delta - a.delta);
      break;
  }
  return sorted;
}

const pct = (x: number) => `${(x * 100).toFixed(1).padStart(5)}%`;
const pp = (x: number) => (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + 'pp';

function printTable(rows: Row[]): void {
  const header =
    'card'.padEnd(26) + ' ' +
    'cost'.padStart(4) + ' ' +
    'drawn'.padStart(6) + ' ' +
    'played'.padStart(6) + ' ' +
    'pRate'.padStart(6) + ' ' +
    'medT'.padStart(5) + ' ' +
    'wr_play'.padStart(8) + ' ' +
    'wr_no'.padStart(6) + ' ' +
    'Δ'.padStart(9);
  console.log(header);
  for (const r of rows) {
    console.log(
      r.name.slice(0, 26).padEnd(26) + ' ' +
        String(r.cost).padStart(4) + ' ' +
        String(r.drawn).padStart(6) + ' ' +
        String(r.played).padStart(6) + ' ' +
        pct(r.playRate) + ' ' +
        String(r.medianTurn).padStart(5) + ' ' +
        pct(r.wrPlay) + ' ' +
        pct(r.wrNoPlay) + ' ' +
        pp(r.delta).padStart(9),
    );
  }
}

function printCardDetail(row: Row): void {
  console.log('');
  console.log(`  ┌─ ${row.name}`);
  console.log(`  │  id:          ${row.defId}`);
  console.log(`  │  cost:        ${row.cost}`);
  console.log(`  │  drawn:       ${row.drawn}`);
  console.log(`  │  played:      ${row.played}`);
  console.log(`  │  playRate:    ${(row.playRate * 100).toFixed(1)}%`);
  console.log(`  │  medianTurn:  ${row.medianTurn}`);
  console.log(`  │  wr_play:     ${(row.wrPlay * 100).toFixed(1)}%`);
  console.log(`  │  wr_no:       ${(row.wrNoPlay * 100).toFixed(1)}%`);
  console.log(`  │  Δ:           ${pp(row.delta)}`);
  console.log(`  └─`);
}

// ─── main ───

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const t0 = Date.now();

  console.log('═══════════════════════════════════════════════════');
  console.log(`  Card stats — scope=[${args.series.join(', ')}]`);
  console.log(`  Bot: ${args.botName}, N/pair=${args.n}`);
  if (args.all) console.log(`  Mode: ALL (sort=${args.sortBy})`);
  if (args.cardLookup) console.log(`  Mode: CARD LOOKUP ("${args.cardLookup}")`);
  console.log('═══════════════════════════════════════════════════\n');

  const pairs: Array<[string, string]> = [];
  for (const a of args.deckIds) for (const b of args.deckIds) pairs.push([a, b]);

  const cards = new Map<string, CardAcc>();
  const total = pairs.length * args.n;
  let done = 0;

  for (const [d1, d2] of pairs) {
    for (let i = 0; i < args.n; i++) {
      const seed = `cardstats-${d1}-${d2}-${i}`;
      const info = collectOneGame(args.series, d1, d2, seed, args.botName, args.useMulligan);
      aggregateGame(info, cards);
      done++;
      if (done % 100 === 0 || done === total) {
        process.stdout.write(`\r  running ${done}/${total} …          `);
      }
    }
  }
  process.stdout.write('\r');

  const rows = buildRows(args.series, cards, args.minSamples);
  const sorted = sortRows(rows, args.sortBy);

  // ─── Card lookup mode ───
  if (args.cardLookup) {
    const allDefs = cardsForScope(args.series);

    // Найти целевую карту: сначала по id, потом по имени.
    let targets: CardDefinition[] = [];
    const byId = allDefs[args.cardLookup];
    if (byId) {
      targets = [byId];
    } else {
      targets = Object.values(allDefs).filter((d) => d.name === args.cardLookup);
    }

    if (targets.length === 0) {
      console.log(`\n❌ Карта "${args.cardLookup}" не найдена в scope [${args.series.join(', ')}].`);
      console.log('   Проверь id или имя. Список карт в колоде:');
      console.log('   pnpm run --filter @aspects/simtools list main <deck>');
      return;
    }

    console.log(`\n─── Детали карты: ${args.cardLookup} ──────`);

    for (const def of targets) {
      const row = rows.find((r) => r.defId === def.id);

      if (row) {
        printCardDetail(row);
      } else {
        const raw = cards.get(def.id);
        if (raw && raw.drawn > 0) {
          console.log(`\n  ⚠ ${def.name} (${def.id}): недостаточно сэмплов.`);
          console.log(`    drawn: ${raw.drawn}, played: ${raw.played}`);
          console.log(`    minSamples=${args.minSamples}. Попробуй --min-samples ${Math.max(1, Math.min(raw.drawn, 20))}`);
        } else {
          console.log(`\n  ⚠ ${def.name} (${def.id}): ни разу не была в руке за ${total} партий.`);
          console.log(`    Карта существует, но её нет в пресетах scope.`);
        }
      }
    }

    console.log('');
    console.log(`Готово за ${((Date.now() - t0) / 1000).toFixed(1)}s.`);
    return;
  }

  // ─── Summary mode ───
  const sortLabel = {
    delta: 'Δ',
    playRate: 'playRate',
    cost: 'cost',
    medianTurn: 'medianTurn',
    drawn: 'drawn',
    played: 'played',
  }[args.sortBy];

  console.log(`\n─── Топ 15 по ${sortLabel} (по убыванию) ──────────`);
  printTable(sorted.slice(0, 15));

  if (sorted.length > 15) {
    console.log(`\n─── Топ 15 по ${sortLabel} (по возрастанию) ────────`);
    printTable(sorted.slice(-15).reverse());
  }

  const dead = rows
    .filter((r) => r.playRate < args.minPlayRateForDead)
    .sort((a, b) => a.playRate - b.playRate);
  console.log(`\n─── «Мёртвый груз» (playRate < ${(args.minPlayRateForDead * 100).toFixed(0)}%) ───────────`);
  if (dead.length === 0) console.log('  (нет)');
  else printTable(dead.slice(0, 20));

  // ─── Full list ───
  if (args.all) {
    console.log(`\n═══════════════════════════════════════════════════`);
    console.log(`  Полный список: ${sorted.length} карт (sort=${args.sortBy})`);
    console.log(`═══════════════════════════════════════════════════\n`);
    printTable(sorted);
  } else {
    console.log(`\n💡 Полный список (${sorted.length} карт): добавь --all`);
    console.log(`   Детали карты: --card <id|name>`);
    console.log(`   Другая сортировка: --sort ${['delta', 'playRate', 'cost', 'medianTurn', 'drawn', 'played'].filter((f) => f !== args.sortBy).join(' | ')}`);
  }

  console.log('\n─── Как читать ────────────────────────────────');
  console.log('  Δ >  +8pp   — сильный сигнал «карта ценна»');
  console.log('  Δ    +3..+8pp — умеренный сигнал');
  console.log('  Δ    −3..+3pp — в пределах шума');
  console.log('  Δ <  −8pp   — карта устойчиво коррелирует с поражениями');
  console.log('  playRate < 15% — мёртвый груз');
  console.log('  ВНИМАНИЕ: корреляция, не причинность. Win-more карты имеют');
  console.log('  высокий Δ; comeback-карты — низкий. Смотри на cost и контекст.');
  console.log('');
  console.log(`Готово за ${((Date.now() - t0) / 1000).toFixed(1)}s.`);
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}