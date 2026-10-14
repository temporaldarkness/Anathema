#!/usr/bin/env tsx
/**
 * Дамп GameState после N команд для отладки.
 *
 * Использование:
 *   pnpm --filter @aspects/bot exec tsx scripts/dump-state.ts \
 *     azeroth stormwind voidflame 5 > state.json
 *
 * Выводит JSON сериализованного state в stdout. Можно
 * вставить в тест как фикстуру или сравнить два прогона.
 */

import { createGame, applyCommand, type GameState } from '@aspects/engine';
import { getPack, getDecks } from '@aspects/cards';
import { GreedyBot } from '../src/greedy';
import { writeFileSync } from 'node:fs';

const [packId, p1DeckId, p2DeckId, nStr] = process.argv.slice(2);
if (!packId || !p1DeckId || !p2DeckId || !nStr) {
  console.error('Использование: dump-state.ts <pack> <p1Deck> <p2Deck> <N>');
  process.exit(1);
}

const N = parseInt(nStr, 10);
const pack = getPack(packId);
const decks = getDecks(packId);
const d1 = decks.find((d) => d.id === p1DeckId)!;
const d2 = decks.find((d) => d.id === p2DeckId)!;

let state: GameState = createGame({
  seed: 'dump-fixed-seed',
  decks: { p1: d1.cards, p2: d2.cards },
  cardDefinitions: pack.cardsById,
  useMulligan: false,
}).state;

const bots = { p1: new GreedyBot(), p2: new GreedyBot() };

for (let i = 0; i < N && !state.winner; i++) {
  const cmd = bots[state.activePlayer].chooseCommand(state, state.activePlayer);
  if (!cmd) break;
  state = applyCommand(state, cmd).state;
}

writeFileSync('state-dump.json', JSON.stringify(state, null, 2), 'utf8');
console.log('Дамп сохранён в state-dump.json');
console.log(`Ход: ${state.turnNumber}, фаза: ${state.phase}, активный: ${state.activePlayer}`);
console.log(`Величие: P1=${state.players.p1.glory}, P2=${state.players.p2.glory}`);
console.log(`Рука: P1=${state.players.p1.hand.length}, P2=${state.players.p2.hand.length}`);