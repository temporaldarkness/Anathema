/**
 * Турнир ботов. Запуск:
 *   pnpm --filter @aspects/backend tournament
 */

import * as dotenv from 'dotenv';
import { join } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { createGame, applyCommand, type Command, type GameState } from '@aspects/engine';
import { makeBot, listAllBotIds } from '@aspects/bot';
import { getDecks, mergedCardsById, seriesOfDeck } from '@aspects/cards';
import {
  updatePair,
  RATING_DEFAULTS,
  roundRating,
  type Rating,
} from '../rating/glicko2';

// Ищем .env по приоритету:
//   1. apps/backend/.env            — если появится, приоритетнее
//   2. корень монорепы (.env)       — где он лежит сейчас
//   3. fallback от dist/scripts     — если CWD окажется не тем
dotenv.config();
dotenv.config({ path: join(process.cwd(), '..', '..', '..', '..', '.env') });
dotenv.config({
  path: join(__dirname, '..', '..', '..', '..', '..', '..', '.env'),
});

const TOTAL_MATCHES = 12000;
const MAX_TURNS_SAFETY = 1000;

const adapter = new PrismaPg({
  connectionString: process.env.ASPECTS_DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

interface PlayerState {
  rating: Rating;
  wins: number;
  losses: number;
  matches: number;
}

const states = new Map<string, PlayerState>();

function randomOf<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomSeed(): string {
  return `tournament-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Прогоняет одну партию между двумя ботами.
 * Возвращает 'p1' | 'p2' | 'draw' | 'abort'.
 */
function playMatch(
  bot1Id: string,
  bot2Id: string,
  cardDefs: Record<string, any>,
  deckP1: string[],
  deckP2: string[],
): 'p1' | 'p2' | 'draw' | 'abort' {
  const initial = createGame({
    seed: randomSeed(),
    decks: { p1: deckP1, p2: deckP2 },
    cardDefinitions: cardDefs,
    useMulligan: true,
  });

  const bot1 = makeBot(bot1Id);
  const bot2 = makeBot(bot2Id);

  let state: GameState = initial.state;
  let turns = 0;

  while (!state.winner && turns < MAX_TURNS_SAFETY) {
    turns++;

    let cmd: Command | null = null;

    if (state.phase === 'MULLIGAN') {
      const picker: 'p1' | 'p2' = !state.mulliganDone.p1 ? 'p1' : 'p2';
      const bot = picker === 'p1' ? bot1 : bot2;
      cmd = bot.chooseCommand(state, picker);
      if (!cmd) cmd = { type: 'MULLIGAN', playerId: picker, cardId: null };
    } else if (state.pendingChoice) {
      const pid = state.pendingChoice.playerId;
      const bot = pid === 'p1' ? bot1 : bot2;
      cmd = bot.chooseCommand(state, pid);
      if (!cmd) {
        // fallback — свернуть выбор без цели
        const choice = state.pendingChoice;
        const cardIds =
          choice.kind === 'EFFECT_TARGET_SELECTION'
            ? []
            : choice.eligibleCardIds.slice(0, choice.count);
        cmd = { type: 'RESOLVE_CHOICE', playerId: pid, cardIds };
      }
    } else {
      const pid = state.activePlayer;
      const bot = pid === 'p1' ? bot1 : bot2;
      cmd = bot.chooseCommand(state, pid);
      if (!cmd) {
        if (state.phase === 'PLAY' || state.phase === 'COMBAT') {
          cmd = { type: 'END_TURN', playerId: pid };
        } else {
          cmd = { type: 'ADVANCE_PHASE', playerId: pid };
        }
      }
    }

    const result = applyCommand(state, cmd);
    if (result.events.some((e) => e.type === 'COMMAND_REJECTED')) {
      // Что-то сломалось — прерываем партию.
      console.warn(
        `[tournament] rejected: ${cmd.type} in ${state.phase} (turn ${turns})`,
      );
      return 'abort';
    }
    state = result.state;
  }

  if (!state.winner) return 'abort';
  if (state.winner === 'p1') return 'p1';
  if (state.winner === 'p2') return 'p2';
  return 'draw';
}

async function main(): Promise<void> {
  const botIds = listAllBotIds();
  console.log(`[tournament] bots: ${botIds.length}`);
  console.log(`[tournament] matches: ${TOTAL_MATCHES}`);

  // Инициализация
  for (const id of botIds) {
    const existing = await prisma.botRating.findUnique({ where: { botId: id } });
    if (existing) {
      states.set(id, {
        rating: {
          rating: existing.rating,
          rd: existing.rd,
          volatility: existing.volatility,
        },
        wins: existing.wins,
        losses: existing.losses,
        matches: existing.matchesPlayed,
      });
    } else {
      states.set(id, {
        rating: { ...RATING_DEFAULTS },
        wins: 0,
        losses: 0,
        matches: 0,
      });
    }
  }

  const allPresets = getDecks();
  const presetPools = allPresets.map((d) => ({
    cards: d.cards,
    cardDefs: mergedCardsById(seriesOfDeck(d.cards)),
  }));

  let aborted = 0;

  for (let i = 0; i < TOTAL_MATCHES; i++) {
    // Двое разных ботов
    let id1 = randomOf(botIds);
    let id2 = randomOf(botIds);
    let safety = 0;
    while (id2 === id1 && safety++ < 10) {
      id2 = randomOf(botIds);
    }
    if (id1 === id2) continue;

    const preset = randomOf(presetPools);

    const outcome = playMatch(id1, id2, preset.cardDefs, preset.cards, preset.cards);

    if (outcome === 'abort') {
      aborted++;
      continue;
    }

    const s1 = states.get(id1)!;
    const s2 = states.get(id2)!;

    const outcomeName =
      outcome === 'p1' ? 'p1_win' : outcome === 'p2' ? 'p2_win' : 'draw';
    const { p1: new1, p2: new2 } = updatePair(s1.rating, s2.rating, outcomeName);

    s1.rating = new1;
    s2.rating = new2;
    s1.matches++;
    s2.matches++;
    if (outcome === 'p1') {
      s1.wins++;
      s2.losses++;
    } else if (outcome === 'p2') {
      s1.losses++;
      s2.wins++;
    }

    if ((i + 1) % 50 === 0 || i === TOTAL_MATCHES - 1) {
      console.log(
        `[tournament] ${i + 1}/${TOTAL_MATCHES} (aborted: ${aborted})`,
      );
    }
  }

  // Сохраняем
  const updates = Array.from(states.entries()).map(([botId, s]) => ({
    botId,
    rating: s.rating.rating,
    rd: s.rating.rd,
    volatility: s.rating.volatility,
    matchesPlayed: s.matches,
    wins: s.wins,
    losses: s.losses,
  }));

  await prisma.$transaction(
    updates.map((u) =>
      prisma.botRating.upsert({
        where: { botId: u.botId },
        create: u,
        update: u,
      }),
    ),
  );

  console.log(`\n[tournament] done. Results:\n`);
  const sorted = [...states.entries()].sort(
    (a, b) => b[1].rating.rating - a[1].rating.rating,
  );
  for (const [id, s] of sorted) {
    console.log(
      `  ${id.padEnd(40)} ${String(roundRating(s.rating.rating)).padStart(5)}  ` +
        `RD ${String(Math.round(s.rating.rd)).padStart(3)}  ` +
        `W/L ${s.wins}/${s.losses} (${s.matches})`,
    );
  }
  console.log(`\n[tournament] aborted matches: ${aborted}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('[tournament] fatal:', e);
  process.exit(1);
});