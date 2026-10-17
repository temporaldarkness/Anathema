#!/usr/bin/env tsx
/**
 * Трассировка одной партии по шагам.
 *
 * Usage:
 *   trace <scope> <p1Deck> <p2Deck> <seed> <botName>
 */

import { createGame, applyCommand } from '@aspects/engine';
import type { GameState } from '@aspects/engine';
import { decksForScope, resolveScope, cardsForScope, listScopes } from '@aspects/cards';
import { makeBot, listAllBotIds } from '@aspects/bot';
import { pickResponder } from '../src/runner';

function frontStr(state: GameState, pid: 'p1' | 'p2'): string {
  const out: string[] = [];
  for (let i = 0; i < 5; i++) {
    const col = state.board[i];
    const id = pid === 'p1' ? col.p1Front : col.p2Front;
    if (!id) {
      out.push('.');
      continue;
    }
    const c = state.cards[id];
    const def = c ? state.definitions[c.definitionId] : null;
    out.push(`${def?.name ?? '?'}(${c?.damageTaken ?? 0})`);
  }
  return out.join(' ');
}

function neutralsStr(state: GameState): string {
  return state.board.map((c) => c.neutralOwner ?? '.').join(' ');
}

function summarize(state: GameState): string {
  return (
    `turn=${state.turnNumber} phase=${state.phase} active=${state.activePlayer} ` +
    `glory=${state.players.p1.glory}/${state.players.p2.glory} ` +
    `inf=${state.players[state.activePlayer].influence} ` +
    `hand=${state.players[state.activePlayer].hand.length} | ` +
    `front p1=[${frontStr(state, 'p1')}] p2=[${frontStr(state, 'p2')}] | ` +
    `neutral=[${neutralsStr(state)}]`
  );
}

function main(): void {
  const [scopeStr, p1DeckId, p2DeckId, seed, botName] = process.argv.slice(2);
  if (!scopeStr || !p1DeckId || !p2DeckId || !seed || !botName) {
    console.error('Usage: trace <scope> <p1Deck> <p2Deck> <seed> <botName>');
    process.exit(1);
  }
  const series = resolveScope(scopeStr);
  if (series.length === 0) {
    console.error(`Empty scope "${scopeStr}". Known: ${listScopes().map((s) => s.id).join(', ')}`);
    process.exit(1);
  }
  const botIds = listAllBotIds();
  if (!botIds.includes(botName)) {
    console.error(`Unknown bot "${botName}". Known: ${botIds.join(', ')}`);
    process.exit(1);
  }
  const decks = decksForScope(scopeStr);
  const d1 = decks.find((d) => d.id === p1DeckId);
  const d2 = decks.find((d) => d.id === p2DeckId);
  if (!d1 || !d2) {
    console.error(
      `Unknown deck. Available in scope [${series.join(', ')}]: ${decks.map((d) => d.id).join(', ')}`,
    );
    process.exit(1);
  }

  const cardDefs = cardsForScope(scopeStr);
  let state: GameState = createGame({
    seed,
    decks: { p1: [...d1.cards], p2: [...d2.cards] },
    cardDefinitions: cardDefs,
    useMulligan: false,
  }).state;

  const bots = {
    p1: makeBot(botName),
    p2: makeBot(botName),
  };

  console.log(`── Initial: ${summarize(state)}`);

  const maxSteps = 5000;
  let steps = 0;
  while (!state.winner && steps < maxSteps) {
    const responder = pickResponder(state);
    if (responder === null) {
      console.log(`[${steps}] no responder (завершено)`);
      break;
    }
    const cmd = bots[responder].chooseCommand(state, responder);
    if (!cmd) {
      console.log(`[${steps}] no command (bot returned null)`);
      break;
    }
    const r = applyCommand(state, cmd);
    const rejected = r.events.find((e) => (e as { type?: string }).type === 'COMMAND_REJECTED');
    const rej = rejected ? '  ✗REJECTED' : '';
    console.log(`\n[${steps}] ${responder}: ${JSON.stringify(cmd)}${rej}`);
    state = r.state;
    console.log(`     → ${summarize(state)}`);
    steps++;
  }

  console.log(`\n── End: winner=${state.winner} reason=${state.winnerReason} steps=${steps}`);
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}