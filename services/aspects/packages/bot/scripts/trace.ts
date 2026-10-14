#!/usr/bin/env tsx
/**
 * Трассировка одной партии.
 *
 * Usage:
 *   pnpm --filter @aspects/bot trace <packId> <p1Deck> <p2Deck> <seed> <botName>
 *
 * Пример:
 *   pnpm --filter @aspects/bot trace azeroth stormwind voidflame debug-1 heuristic > h.log
 *   pnpm --filter @aspects/bot trace azeroth stormwind voidflame debug-1 greedy    > g.log
 *
 * Затем сравни h.log и g.log — первое расхождение в командах и есть
 * точка, где боты по-разному оценивают ситуацию.
 */

import { createGame, applyCommand } from '@aspects/engine';
import type { GameState } from '@aspects/engine';
import { getPack, getDecks } from '@aspects/cards';
import { GreedyBot } from '../src/greedy';
import { HeuristicBot } from '../src/heuristic';
import type { Bot } from '../src/types';

function makeBot(name: string): Bot {
  switch (name) {
    case 'greedy':
      return new GreedyBot('Greedy');
    case 'heuristic':
      return new HeuristicBot('Heuristic');
    case 'heuristic-play':
      return new HeuristicBot('HeuristicPlay', {
        play: true, attack: false, ability: false,
      });
    case 'heuristic-attack':
      return new HeuristicBot('HeuristicAttack', {
        play: false, attack: true, ability: false,
      });
    case 'heuristic-full':
      return new HeuristicBot('HeuristicFull', {
        play: true, attack: true, ability: true,
      });
    case 'heuristic-v2':
      return new HeuristicBot('HeuristicV2', {
        play: true, attack: true, ability: false,
        smartAbility: true,
        smartDiscard: true,
        column5Penalty: true,
        smartMulligan: true,
      });
    case 'heuristic-v2-no-ability':
      // Изоляция: v2 без smart ability.
      return new HeuristicBot('HeuristicV2NA', {
        play: true, attack: true, ability: false,
        smartDiscard: true,
        column5Penalty: true,
        smartMulligan: true,
      });
	case 'heuristic-v3':
      return new HeuristicBot('HeuristicV3', {
        play: true, attack: true, ability: false,
        smartAbility: false,  // ← решаем по результатам
        smartDiscard: true,
        column5Penalty: true,
        smartMulligan: true,
        smartReplace: true,
      });
	case 'heuristic-v3-no-replace':
      return new HeuristicBot('HeuristicV3NR', {
        play: true, attack: true, ability: false,
        smartDiscard: true,
        column5Penalty: true,
        smartMulligan: true,
        smartReplace: false,
      });
    case 'heuristic-v4':
      return new HeuristicBot('HeuristicV4', {
        play: true, attack: true, ability: false,
        smartDiscard: true,
        column5Penalty: true,
        smartReplace: true,
        v4Attack: true,
        v4Triggers: true,
        v4MulliganV2: true,
        v4ReplaceV2: false,
      });
    case 'heuristic-v4-no-triggers':
      return new HeuristicBot('HeuristicV4NT', {
        play: true, attack: true, ability: false,
        smartDiscard: true,
        column5Penalty: true,
        smartReplace: true,
        v4Attack: true,
        v4Triggers: false,
        v4MulliganV2: true,
        v4ReplaceV2: true,
      });
    case 'heuristic-v4-no-attack':
      return new HeuristicBot('HeuristicV4NA', {
        play: true, attack: true, ability: false,
        smartDiscard: true,
        column5Penalty: true,
        smartReplace: true,
        v4Attack: false,
        v4Triggers: true,
        v4MulliganV2: true,
        v4ReplaceV2: true,
      });
    case 'heuristic-v4-no-replace':
      return new HeuristicBot('HeuristicV4NR', {
        play: true, attack: true, ability: false,
        smartDiscard: true,
        column5Penalty: true,
        smartReplace: true,
        v4Attack: true,
        v4Triggers: true,
        v4MulliganV2: true,
        v4ReplaceV2: false,
      });
	case 'heuristic-v5':
      return new HeuristicBot('HeuristicV5', {
        play: true, attack: true, ability: false,
        smartDiscard: true,
        column5Penalty: true,
        smartReplace: true,
        v4Attack: true,
        v4Triggers: true,
        v4MulliganV2: true,
        v4ReplaceV2: false,
        v5Lookahead: true,
        v5AltVictory: true,
      });
    case 'heuristic-v5-lookahead-only':
      return new HeuristicBot('HeuristicV5L', {
        play: true, attack: true, ability: false,
        smartDiscard: true,
        column5Penalty: true,
        smartReplace: true,
        v4Attack: true,
        v4Triggers: true,
        v4MulliganV2: true,
        v4ReplaceV2: false,
        v5Lookahead: true,
        v5AltVictory: false,
      });
    case 'heuristic-v5-altvictory-only':
      return new HeuristicBot('HeuristicV5A', {
        play: true, attack: true, ability: false,
        smartDiscard: true,
        column5Penalty: true,
        smartReplace: true,
        v4Attack: true,
        v4Triggers: true,
        v4MulliganV2: true,
        v4ReplaceV2: false,
        v5Lookahead: false,
        v5AltVictory: true,
      });
    default:
      throw new Error(
        `Unknown bot: "${name}". Use: greedy | heuristic | heuristic-play | ` +
        `heuristic-attack | heuristic-full | heuristic-v2 | ` +
        `heuristic-v2-no-ability | old`,
      );
  }
}

function frontStr(state: GameState, pid: 'p1' | 'p2'): string {
  const out: string[] = [];
  for (let i = 0; i < 5; i++) {
    const col = state.board[i];
    const id = pid === 'p1' ? col.p1Front : col.p2Front;
    if (!id) { out.push('.'); continue; }
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
  const [packId, p1DeckId, p2DeckId, seed, botName] = process.argv.slice(2);
  if (!packId || !p1DeckId || !p2DeckId || !seed || !botName) {
    console.error('Usage: trace <packId> <p1Deck> <p2Deck> <seed> <botName>');
    process.exit(1);
  }
  const pack = getPack(packId);
  const decks = getDecks(packId);
  const d1 = decks.find((d) => d.id === p1DeckId);
  const d2 = decks.find((d) => d.id === p2DeckId);
  if (!d1 || !d2) {
    console.error('Deck not found');
    process.exit(1);
  }

  let state: GameState = createGame({
    seed,
    decks: { p1: d1.cards, p2: d2.cards },
    cardDefinitions: pack.cardsById,
    useMulligan: false,
  }).state;

  const bot: Bot = makeBot(botName);

  console.log(`── Initial: ${summarize(state)}`);

  const maxSteps = 5000;
  let steps = 0;
  while (!state.winner && steps < maxSteps) {
    const cmd = bot.chooseCommand(state, state.activePlayer);
    if (!cmd) {
      console.log(`[${steps}] no command (bot returned null)`);
      break;
    }
    const r = applyCommand(state, cmd);
    const rejected = r.events.find(
      (e) => (e as { type?: string }).type === 'COMMAND_REJECTED',
    );
    const rej = rejected ? '  ✗REJECTED' : '';
    console.log(`\n[${steps}] ${state.activePlayer}: ${JSON.stringify(cmd)}${rej}`);
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