#!/usr/bin/env tsx
/**
 * Дамп GameState после N команд.
 *
 * Usage:
 *   dump-state <scope> <p1Deck> <p2Deck> <N> [botName] [outFile]
 */

import { createGame, applyCommand } from '@aspects/engine';
import type { GameState } from '@aspects/engine';
import { decksForScope, resolveScope, cardsForScope, listScopes } from '@aspects/cards';
import { makeBot, listAllBotIds } from '@aspects/bot';
import { pickResponder } from '../src/runner';
import { writeFileSync } from 'node:fs';

const DEFAULT_BOT = 'heuristic-v5-balanced-master';

function main(): void {
  const [scopeStr, p1DeckId, p2DeckId, nStr, botNameArg, outFileArg] = process.argv.slice(2);
  if (!scopeStr || !p1DeckId || !p2DeckId || !nStr) {
    console.error('Usage: dump-state <scope> <p1Deck> <p2Deck> <N> [botName] [outFile]');
    process.exit(1);
  }
  const N = Number.parseInt(nStr, 10);
  if (!Number.isFinite(N) || N <= 0) {
    console.error(`Invalid N: ${nStr}`);
    process.exit(1);
  }
  const series = resolveScope(scopeStr);
  if (series.length === 0) {
    console.error(`Empty scope "${scopeStr}". Known: ${listScopes().map((s) => s.id).join(', ')}`);
    process.exit(1);
  }
  const botName = botNameArg ?? DEFAULT_BOT;
  if (!listAllBotIds().includes(botName)) {
    console.error(`Unknown bot "${botName}".`);
    process.exit(1);
  }
  const outFile = outFileArg ?? 'state-dump.json';
  const decks = decksForScope(scopeStr);
  const d1 = decks.find((d) => d.id === p1DeckId);
  const d2 = decks.find((d) => d.id === p2DeckId);
  if (!d1 || !d2) {
    console.error(
      `Unknown deck. Available in scope [${series.join(', ')}]: ${decks.map((d) => d.id).join(', ')}`,
    );
    process.exit(1);
  }

  let state: GameState = createGame({
    seed: 'dump-fixed-seed',
    decks: { p1: [...d1.cards], p2: [...d2.cards] },
    cardDefinitions: cardsForScope(scopeStr),
    useMulligan: false,
  }).state;

  const bots = {
    p1: makeBot(botName),
    p2: makeBot(botName),
  };

  for (let i = 0; i < N && !state.winner; i++) {
    const responder = pickResponder(state);
    if (responder === null) break;
    const cmd = bots[responder].chooseCommand(state, responder);
    if (!cmd) break;
    state = applyCommand(state, cmd).state;
  }

  writeFileSync(outFile, JSON.stringify(state, null, 2), 'utf8');
  console.log(`Дамп сохранён в ${outFile}`);
  console.log(`Ход: ${state.turnNumber}, фаза: ${state.phase}, активный: ${state.activePlayer}`);
  console.log(`Величие: P1=${state.players.p1.glory}, P2=${state.players.p2.glory}`);
  console.log(`Рука: P1=${state.players.p1.hand.length}, P2=${state.players.p2.hand.length}`);
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}