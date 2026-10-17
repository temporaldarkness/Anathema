#!/usr/bin/env tsx
/**
 * Генетический поиск колод в рамках scope.
 *
 * Fitness = winrate против смеси:
 *   - всех базовых пресетов scope'а
 *   - top-5 особей прошлой генерации (co-evolution)
 *
 * Usage:
 *   deck-optimizer <scope> [options]
 *
 * Options:
 *   --pop N         размер популяции (default 12)
 *   --gen N         число поколений (default 12)
 *   --eval N        партий на оценку особи (default 30)
 *   --elite N       размер элиты (default 2)
 *   --seed STR      seed для воспроизводимости
 *   --bot NAME      бот (default heuristic-v5-balanced-master)
 *   --out FILE      сохранить топ-колоды в JSON
 *
 * Валидация колоды:
 *   - ровно 30 карт
 *   - <= 4 серий
 *   - <= 5 копий одной Личности
 *   - <= 2 копий одного Аспекта
 *   - <= 1 легендарки одного id
 */

import type { CardDefinition } from '@aspects/cards';
import {
  cardsForScope,
  decksForScope,
  resolveScope,
  listScopes,
  seriesOfDeck,
} from '@aspects/cards';
import { makeBot, listAllBotIds } from '@aspects/bot';
import { runOneGameRaw } from '../src/runner';
import { writeFileSync } from 'node:fs';

const DEFAULT_BOT = 'heuristic-v5-balanced-master';
const DECK_SIZE = 30;
const MAX_SERIES = 4;
const MAX_COPIES_PER_PERSONALITY = 5;
const MAX_COPIES_PER_ASPECT = 2;

// ─── RNG ───

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

type Rng = () => number;

function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pick<T>(arr: T[], rng: Rng): T {
  return arr[Math.floor(rng() * arr.length)];
}

// ─── Валидация ───

interface DeckValidation {
  valid: boolean;
  reason?: string;
}

function validateDeck(
  cards: string[],
  cardDefs: Record<string, CardDefinition>,
): DeckValidation {
  if (cards.length !== DECK_SIZE) {
    return { valid: false, reason: `size ${cards.length}, need ${DECK_SIZE}` };
  }

  const seriesSet = new Set<string>();
  const aspectCount = new Map<string, number>();
  const personalityCount = new Map<string, number>();
  const legendaryCount = new Map<string, number>();

  for (const cid of cards) {
    const def = cardDefs[cid];
    if (!def) return { valid: false, reason: `unknown card ${cid}` };
    if (def.isToken) return { valid: false, reason: `token ${cid} not allowed` };

    for (const s of def.series ?? []) seriesSet.add(s);
    aspectCount.set(cid, (aspectCount.get(cid) ?? 0) + 1);
    personalityCount.set(
      def.personalityTag,
      (personalityCount.get(def.personalityTag) ?? 0) + 1,
    );
    if (def.rarity === 'legendary') {
      legendaryCount.set(cid, (legendaryCount.get(cid) ?? 0) + 1);
    }
  }

  if (seriesSet.size > MAX_SERIES) {
    return { valid: false, reason: `series ${seriesSet.size} > ${MAX_SERIES}` };
  }
  for (const [cid, n] of aspectCount) {
    if (n > MAX_COPIES_PER_ASPECT) {
      return { valid: false, reason: `${n}× aspect ${cid} > ${MAX_COPIES_PER_ASPECT}` };
    }
  }
  for (const [pt, n] of personalityCount) {
    if (n > MAX_COPIES_PER_PERSONALITY) {
      return { valid: false, reason: `${n}× personality ${pt} > ${MAX_COPIES_PER_PERSONALITY}` };
    }
  }
  for (const [cid, n] of legendaryCount) {
    if (n > 1) {
      return { valid: false, reason: `${n}× legendary ${cid} > 1` };
    }
  }

  return { valid: true };
}

// ─── Геном ───

interface DeckGenome {
  cards: string[];
  series: string[];
  signature: string; // для дедупликации
}

function makeGenome(cards: string[]): DeckGenome {
  const sorted = [...cards].sort();
  const signature = sorted.join(',');
  return {
    cards,
    series: seriesOfDeck(cards),
    signature,
  };
}

// ─── Генерация ───

function canAddCard(
  def: CardDefinition,
  deck: string[],
  cardDefs: Record<string, CardDefinition>,
): boolean {
  const personalityCount = deck.filter(
    (id) => cardDefs[id]?.personalityTag === def.personalityTag,
  ).length;
  if (personalityCount >= MAX_COPIES_PER_PERSONALITY) return false;

  const aspectCount = deck.filter((id) => id === def.id).length;
  if (aspectCount >= MAX_COPIES_PER_ASPECT) return false;

  if (def.rarity === 'legendary' && aspectCount >= 1) return false;

  return true;
}

function randomDeck(
  scopeSeries: string[],
  cardDefs: Record<string, CardDefinition>,
  rng: Rng,
): DeckGenome | null {
  const seriesPool = shuffle(scopeSeries, rng);
  const seriesCount = 1 + Math.floor(rng() * MAX_SERIES);
  const usedSeries = seriesPool.slice(0, Math.min(seriesCount, seriesPool.length));

  const pool = Object.values(cardDefs).filter(
    (c) =>
      !c.isToken &&
      (c.series ?? []).some((s) => usedSeries.includes(s)),
  );
  if (pool.length === 0) return null;

  const deck: string[] = [];
  let attempts = 0;
  while (deck.length < DECK_SIZE && attempts < 2000) {
    attempts++;
    const card = pick(pool, rng);
    if (canAddCard(card, deck, cardDefs)) {
      deck.push(card.id);
    }
  }
  if (deck.length < DECK_SIZE) return null;

  return makeGenome(deck);
}

// ─── Оценка ───

interface EvalContext {
  series: string[];
  botName: string;
  opponents: string[][]; // списки card ids
  gamesPerEval: number;
  rng: Rng;
}

function evaluateDeck(
  genome: DeckGenome,
  ctx: EvalContext,
): number {
  let wins = 0;
  let games = 0;

  for (let g = 0; g < ctx.gamesPerEval; g++) {
    // Выбираем случайного оппонента из пула
    const oppCards = pick(ctx.opponents, ctx.rng);

    // Чередуем стороны P1/P2 для устранения first-move bias
    const ourP1 = g % 2 === 0;
    const p1Cards = ourP1 ? genome.cards : oppCards;
    const p2Cards = ourP1 ? oppCards : genome.cards;

    const r = runOneGameRaw(ctx.series, [...p1Cards], [...p2Cards], `eval-${Math.floor(ctx.rng() * 1e9)}-${g}`, {
      bots: { p1: makeBot(ctx.botName), p2: makeBot(ctx.botName) },
      useMulligan: true,
    });

    if (!r.winner) continue;
    const ourWon = ourP1 ? r.winner === 'p1' : r.winner === 'p2';
    if (ourWon) wins++;
    games++;
  }

  return games > 0 ? wins / games : 0;
}

// ─── Crossover / mutation ───

function crossover(
  a: DeckGenome,
  b: DeckGenome,
  cardDefs: Record<string, CardDefinition>,
  rng: Rng,
): DeckGenome | null {
  const mixed = [...a.cards, ...b.cards];
  const shuffled = shuffle(mixed, rng);
  const deck: string[] = [];
  for (const id of shuffled) {
    if (deck.length >= DECK_SIZE) break;
    const def = cardDefs[id];
    if (!def) continue;
    if (canAddCard(def, deck, cardDefs)) {
      deck.push(id);
    }
  }
  if (deck.length < DECK_SIZE) return null;
  return makeGenome(deck);
}

function mutate(
  genome: DeckGenome,
  cardDefs: Record<string, CardDefinition>,
  rng: Rng,
  mutationRate = 0.15,
): DeckGenome {
  const cards = [...genome.cards];

  // Пул карт для замены: только из серий genome
  const pool = Object.values(cardDefs).filter(
    (c) =>
      !c.isToken &&
      (c.series ?? []).some((s) => genome.series.includes(s)),
  );

  const n = Math.max(1, Math.floor(cards.length * mutationRate));
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(rng() * cards.length);
    const candidate = pick(pool, rng);
    const without = [...cards.slice(0, idx), ...cards.slice(idx + 1)];
    if (canAddCard(candidate, without, cardDefs)) {
      cards[idx] = candidate.id;
    }
  }
  return makeGenome(cards);
}

// ─── CLI ───

interface Opts {
  scopeStr: string;
  series: string[];
  population: number;
  generations: number;
  gamesPerEval: number;
  eliteSize: number;
  botName: string;
  seed: string;
  outFile: string | null;
}

function parseArgs(argv: string[]): Opts {
  if (argv.length === 0) {
    console.error(
      'Usage: deck-optimizer <scope> [--pop N] [--gen N] [--eval N] [--elite N] [--bot NAME] [--seed STR] [--out FILE]',
    );
    process.exit(1);
  }
  const scopeStr = argv[0];
  const series = resolveScope(scopeStr);
  if (series.length === 0) {
    console.error(`Empty scope "${scopeStr}". Known: ${listScopes().map((s) => s.id).join(', ')}`);
    process.exit(1);
  }

  let population = 12;
  let generations = 12;
  let gamesPerEval = 30;
  let eliteSize = 2;
  let botName = DEFAULT_BOT;
  let seed = 'optimizer-default';
  let outFile: string | null = null;

  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      i++;
      return argv[i];
    };
    if (a === '--pop') population = parseInt(next(), 10);
    else if (a === '--gen') generations = parseInt(next(), 10);
    else if (a === '--eval') gamesPerEval = parseInt(next(), 10);
    else if (a === '--elite') eliteSize = parseInt(next(), 10);
    else if (a === '--bot') botName = next();
    else if (a === '--seed') seed = next();
    else if (a === '--out') outFile = next();
  }

  if (!listAllBotIds().includes(botName)) {
    console.error(`Unknown bot "${botName}".`);
    process.exit(1);
  }
  if (eliteSize < 1 || eliteSize >= population) {
    console.error(`--elite must be in [1, ${population - 1}]`);
    process.exit(1);
  }

  return {
    scopeStr,
    series,
    population,
    generations,
    gamesPerEval,
    eliteSize,
    botName,
    seed,
    outFile,
  };
}

// ─── main ───

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function printDeck(
  rank: number,
  deck: DeckGenome,
  fitness: number,
  cardDefs: Record<string, CardDefinition>,
): void {
  console.log(`\n#${rank + 1}  winrate=${(fitness * 100).toFixed(1)}%  series=[${deck.series.join(', ')}]`);
  const counts = new Map<string, number>();
  for (const cid of deck.cards) counts.set(cid, (counts.get(cid) ?? 0) + 1);
  const costHist = new Map<number, number>();
  for (const [cid, n] of counts) {
    const def = cardDefs[cid];
    if (!def) continue;
    costHist.set(def.cost, (costHist.get(def.cost) ?? 0) + n);
  }
  const costStr = [...costHist.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([c, n]) => `${c}💰×${n}`)
    .join(' ');
  console.log(`   cost: ${costStr}`);
  const sorted = [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [cid, n] of sorted) {
    const def = cardDefs[cid];
    console.log(`   ${n}× ${(def?.name ?? cid).padEnd(28)} (${def?.cost ?? '?'}💰)`);
  }
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2));
  const rng = mulberry32(hashSeed(opts.seed));
  const cardDefs = cardsForScope(opts.series);

  console.log('═══════════════════════════════════════════════════');
  console.log(`  Deck optimizer`);
  console.log(`  Scope:    ${opts.scopeStr} [${opts.series.join(', ')}]`);
  console.log(`  Bot:      ${opts.botName}`);
  console.log(`  Pop:      ${opts.population}`);
  console.log(`  Gens:     ${opts.generations}`);
  console.log(`  Eval:     ${opts.gamesPerEval} games/deck`);
  console.log(`  Elite:    ${opts.eliteSize}`);
  console.log(`  Seed:     ${opts.seed}`);
  console.log('═══════════════════════════════════════════════════\n');

  // Базовые оппоненты
  const baseDecks = decksForScope(opts.scopeStr).map((d) => d.cards);
  if (baseDecks.length === 0) {
    console.error('No preset decks in scope. Need at least one.');
    process.exit(1);
  }
  console.log(`Base opponents: ${baseDecks.length} presets`);

  // Инициализация популяции с дедупликацией
  let population: DeckGenome[] = [];
  const seenSignatures = new Set<string>();
  let attempts = 0;
  const maxAttempts = opts.population * 50;
  while (population.length < opts.population && attempts < maxAttempts) {
    attempts++;
    const d = randomDeck(opts.series, cardDefs, rng);
    if (!d) continue;
    if (seenSignatures.has(d.signature)) continue;
    seenSignatures.add(d.signature);
    population.push(d);
  }
  if (population.length < opts.population) {
    console.error(
      `Could not generate ${opts.population} unique valid decks (only ${population.length}).`,
    );
    process.exit(1);
  }
  console.log(`Initialized population: ${population.length} unique decks\n`);

  const t0 = Date.now();
  let bestEver: { genome: DeckGenome; fitness: number } | null = null;
  let prevTop: DeckGenome[] = [];

  for (let gen = 0; gen < opts.generations; gen++) {
    // Оппоненты: все базовые + top-5 из прошлой генерации (co-evolution)
    const opponents = [
      ...baseDecks,
      ...prevTop.slice(0, 5).map((g) => g.cards),
    ];

    // Оценка всей популяции
    const evaluated = population.map((genome) => ({
      genome,
      fitness: evaluateDeck(genome, {
        series: opts.series,
        botName: opts.botName,
        opponents,
        gamesPerEval: opts.gamesPerEval,
        rng,
      }),
    }));
    evaluated.sort((a, b) => b.fitness - a.fitness);

    const best = evaluated[0];
    const worst = evaluated[evaluated.length - 1];
    const avg = mean(evaluated.map((e) => e.fitness));

    if (!bestEver || best.fitness > bestEver.fitness) {
      bestEver = { genome: best.genome, fitness: best.fitness };
    }

    console.log(
      `Gen ${String(gen + 1).padStart(2)}/${opts.generations}: ` +
        `best=${(best.fitness * 100).toFixed(1)}% ` +
        `avg=${(avg * 100).toFixed(1)}% ` +
        `worst=${(worst.fitness * 100).toFixed(1)}% ` +
        `(${((Date.now() - t0) / 1000).toFixed(0)}s)`,
    );

    if (gen === opts.generations - 1) break;

    // Селекция: топ-eliteSize + N случайных из середины
    const elite = evaluated.slice(0, opts.eliteSize).map((e) => e.genome);
    const middlePool = evaluated.slice(opts.eliteSize);
    const diversityCount = Math.min(2, middlePool.length);
    const diverse: DeckGenome[] = [];
    for (let i = 0; i < diversityCount; i++) {
      const idx = Math.floor(rng() * middlePool.length);
      diverse.push(middlePool[idx].genome);
    }

    prevTop = elite;

    // Репродукция
    const next: DeckGenome[] = [...elite, ...diverse];
    const nextSeen = new Set(next.map((g) => g.signature));

    while (next.length < opts.population) {
      const parentA = pick(elite, rng);
      const parentB = pick(elite, rng);
      let child = crossover(parentA, parentB, cardDefs, rng);
      if (!child) child = randomDeck(opts.series, cardDefs, rng);
      if (!child) continue;
      child = mutate(child, cardDefs, rng, 0.15);
      if (nextSeen.has(child.signature)) {
        // Дубликат — попробуем ещё раз (но не бесконечно)
        const retry = randomDeck(opts.series, cardDefs, rng);
        if (!retry || nextSeen.has(retry.signature)) continue;
        nextSeen.add(retry.signature);
        next.push(retry);
        continue;
      }
      nextSeen.add(child.signature);
      next.push(child);
    }
    population = next;
  }

  // ─── Финальная проверка топа ───
  console.log('\n─── Финальная оценка топ-5 (100 партий против всех пресетов) ───');
  const finalGames = 100;
  const candidates = [...population];
  if (bestEver) {
    const alreadyIn = candidates.some((g) => g.signature === bestEver!.genome.signature);
    if (!alreadyIn) candidates.push(bestEver.genome);
  }

  const finalEvaluated: Array<{ genome: DeckGenome; fitness: number }> = [];
  for (const genome of candidates.slice(0, 10)) {
    const fit = evaluateDeck(genome, {
      series: opts.series,
      botName: opts.botName,
      opponents: baseDecks,
      gamesPerEval: finalGames,
      rng,
    });
    finalEvaluated.push({ genome, fitness: fit });
  }
  finalEvaluated.sort((a, b) => b.fitness - a.fitness);

  console.log('\n─── Топ-5 колод (финальная оценка) ────────────');
  for (let i = 0; i < Math.min(5, finalEvaluated.length); i++) {
    printDeck(i, finalEvaluated[i].genome, finalEvaluated[i].fitness, cardDefs);
  }

  if (opts.outFile) {
    const payload = {
      scope: opts.scopeStr,
      series: opts.series,
      bot: opts.botName,
      seed: opts.seed,
      generatedAt: new Date().toISOString(),
      topDecks: finalEvaluated.slice(0, 5).map((t) => ({
        cards: t.genome.cards,
        series: t.genome.series,
        fitness: t.fitness,
      })),
    };
    writeFileSync(opts.outFile, JSON.stringify(payload, null, 2), 'utf8');
    console.log(`\nСохранено в ${opts.outFile}`);
  }

  console.log(
    `\n─── Time: ${((Date.now() - t0) / 1000).toFixed(1)}s ───────────────────`,
  );
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}