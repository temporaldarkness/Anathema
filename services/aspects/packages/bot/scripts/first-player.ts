#!/usr/bin/env tsx
/**
 * Анализ преимущества первого хода.
 *
 * Играет N партий на паре колод, для каждой партии запоминает
 * кто был активен в самый первый момент (state.activePlayer сразу
 * после createGame — это и есть первый ходящий) и кто выиграл.
 *
 * Затем считает:
 *   - как часто первым был P1 и как часто P2 (sanity-check
 *     случайности выбора в движке);
 *   - чистый first-mover advantage: P(победил первый) - P(победил второй),
 *     независимо от того, кто такой этот "первый";
 *   - разложение по сторонам, чтобы отделить эффект слота от эффекта
 *     первого хода.
 *
 * Не требует изменений в движке — работает на существующей
 * рандомизации через seed.
 *
 * Использование:
 *   pnpm --filter @aspects/bot first-player <packId> <N> [deck1,deck2,...]
 * Примеры:
 *   first-player azeroth 500                              # все 4 колоды
 *   first-player azeroth 1000 stormwind,stormwind         # чистое зеркало
 */

import { createGame, applyCommand } from '@aspects/engine';
import type { GameState, PlayerId } from '@aspects/engine';
import { getPack, getDecks } from '@aspects/cards';
import { GreedyBot } from '../src/greedy';
import { resolveDeck } from '../src/sim';

interface GameSample {
  firstPlayer: PlayerId;
  winner: PlayerId | null;
}

function runOne(
  packId: string,
  p1DeckId: string,
  p2DeckId: string,
  seed: string,
): GameSample {
  const pack = getPack(packId);
  const d1 = resolveDeck(packId, p1DeckId);
  const d2 = resolveDeck(packId, p2DeckId);

  let state: GameState = createGame({
    seed,
    decks: { p1: d1.cards, p2: d2.cards },
    cardDefinitions: pack.cardsById,
    useMulligan: false,
  }).state;

  const firstPlayer = state.activePlayer;

  const bot = new GreedyBot();
  const maxSteps = 20_000;
  let steps = 0;
  while (!state.winner && steps < maxSteps) {
    const cmd = bot.chooseCommand(state, state.activePlayer);
    if (!cmd) break;
    state = applyCommand(state, cmd).state;
    steps++;
  }

  return { firstPlayer, winner: state.winner ?? null };
}

interface Report {
  games: number;
  p1FirstCount: number;
  p2FirstCount: number;
  firstWins: number;
  secondWins: number;
  draws: number;
  p1FirstP1Wins: number;
  p2FirstP2Wins: number;
}

function analyze(
  packId: string,
  d1: string,
  d2: string,
  n: number,
): Report {
  const r: Report = {
    games: n,
    p1FirstCount: 0,
    p2FirstCount: 0,
    firstWins: 0,
    secondWins: 0,
    draws: 0,
    p1FirstP1Wins: 0,
    p2FirstP2Wins: 0,
  };

  for (let i = 0; i < n; i++) {
    const s = runOne(packId, d1, d2, `fp-${d1}-${d2}-${i}`);
    if (s.firstPlayer === 'p1') {
      r.p1FirstCount++;
      if (s.winner === 'p1') r.p1FirstP1Wins++;
    } else {
      r.p2FirstCount++;
      if (s.winner === 'p2') r.p2FirstP2Wins++;
    }

    if (s.winner === null) {
      r.draws++;
    } else if (s.winner === s.firstPlayer) {
      r.firstWins++;
    } else {
      r.secondWins++;
    }
  }

  return r;
}

function pad(s: string, w: number): string {
  return s.length >= w ? s : s + ' '.repeat(w - s.length);
}

function pct(x: number, total: number): string {
  return total === 0 ? 'n/a' : ((x / total) * 100).toFixed(1);
}

function printReport(title: string, r: Report): void {
  const decisive = r.firstWins + r.secondWins;
  const firstShare = decisive > 0 ? r.firstWins / decisive : 0.5;
  const se = Math.sqrt(0.25 / Math.max(1, decisive));
  const z = (firstShare - 0.5) / se;

  console.log(`── ${title} ─────────────────────────────────`);
  console.log(`  Games:               ${r.games}`);
  console.log(
    `  P1 went first:       ${r.p1FirstCount}  (${pct(r.p1FirstCount, r.games)}%)`,
  );
  console.log(
    `  P2 went first:       ${r.p2FirstCount}  (${pct(r.p2FirstCount, r.games)}%)`,
  );
  console.log('  ── Pure first-mover advantage ──');
  console.log(
    `  First player wins:   ${r.firstWins}  (${pct(r.firstWins, decisive)}%)`,
  );
  console.log(
    `  Second player wins:  ${r.secondWins}  (${pct(r.secondWins, decisive)}%)`,
  );
  console.log(
    `  Draws:               ${r.draws}`,
  );
  console.log(
    `  Advantage:           ${((firstShare - 0.5) * 100).toFixed(1)} п.п.` +
      `  (SE ≈ ${(se * 100).toFixed(1)}%, z = ${z.toFixed(2)})`,
  );
  console.log('  ── Разложение по сторонам ──');
  console.log(
    `  P1 first → P1 wins:  ${r.p1FirstP1Wins} / ${r.p1FirstCount}  (${pct(r.p1FirstP1Wins, r.p1FirstCount)}%)`,
  );
  console.log(
    `  P2 first → P2 wins:  ${r.p2FirstP2Wins} / ${r.p2FirstCount}  (${pct(r.p2FirstP2Wins, r.p2FirstCount)}%)`,
  );
  console.log('');
}

function parseArgs(argv: string[]): {
  packId: string;
  n: number;
  deckIds: string[];
} {
  const [packId, nStr, decksArg] = argv;
  if (!packId || !nStr) {
    console.error(
      'Usage: first-player <packId> <N> [deck1,deck2,...]',
    );
    process.exit(1);
  }
  const n = Number.parseInt(nStr, 10);
  if (!Number.isFinite(n) || n <= 0) {
    console.error(`Invalid N: ${nStr}`);
    process.exit(1);
  }
  const all = getDecks(packId).map((d) => d.id);
  const deckIds = decksArg
    ? decksArg.split(',').map((s) => s.trim()).filter(Boolean)
    : all;
  for (const id of deckIds) {
    if (!all.includes(id)) {
      console.error(
        `Unknown deck "${id}". Available: ${all.join(', ')}`,
      );
      process.exit(1);
    }
  }
  return { packId, n, deckIds };
}

function main(): void {
  const { packId, n, deckIds } = parseArgs(process.argv.slice(2));

  console.log('═══════════════════════════════════════════════════');
  console.log(`  First-player analysis`);
  console.log(`  Pack:      ${packId}`);
  console.log(`  Decks:     ${deckIds.join(', ')}`);
  console.log(`  Games per pair: ${n}`);
  console.log('═══════════════════════════════════════════════════\n');

  const started = Date.now();

  for (const d of deckIds) {
    const r = analyze(packId, d, d, n);
    printReport(`Mirror: ${d} vs ${d}`, r);
  }

  if (deckIds.length > 1) {
    console.log('── Cross-matchups (только d1-as-p1 vs d2-as-p2) ──\n');
    for (const d1 of deckIds) {
      for (const d2 of deckIds) {
        if (d1 === d2) continue;
        const r = analyze(packId, d1, d2, n);
        printReport(`${d1} (p1) vs ${d2} (p2)`, r);
      }
    }
  }

  console.log('═══════════════════════════════════════════════════');
  console.log(`  Time: ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log('═══════════════════════════════════════════════════');
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}