/**
 * Турнир ботов. Запуск:
 *   pnpm --filter @aspects/backend tournament
 *
 * Партии прогоняются через @aspects/simtools (runOneGame).
 * Backend отвечает за Glicko-2, Prisma и сохранение.
 */

import * as dotenv from 'dotenv';
import { join } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { makeBot, listAllBotIds } from '@aspects/bot';
import { getDecks, seriesOfDeck } from '@aspects/cards';
import { runOneGame } from '@aspects/simtools';
import {
  updatePair,
  RATING_DEFAULTS,
  roundRating,
  type Rating,
} from '../rating/glicko2';

dotenv.config();
dotenv.config({ path: join(process.cwd(), '..', '..', '..', '..', '.env') });
dotenv.config({
  path: join(__dirname, '..', '..', '..', '..', '..', '..', '.env'),
});

const TOTAL_MATCHES = 1200;
const MAX_STEPS = 20_000;

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

async function main(): Promise<void> {
  const botIds = listAllBotIds();
  console.log(`[tournament] bots: ${botIds.length}`);
  console.log(`[tournament] matches: ${TOTAL_MATCHES}`);

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

  // Пресеты берём глобально. Серии вычисляются один раз.
  // Если пресет multi-series — попадут все нужные серии.
  const allPresets = getDecks().map((d) => ({
    preset: d,
    series: seriesOfDeck(d.cards),
  }));

  let aborted = 0;
  let played = 0;

  for (let i = 0; i < TOTAL_MATCHES; i++) {
    let id1 = randomOf(botIds);
    let id2 = randomOf(botIds);
    let safety = 0;
    while (id2 === id1 && safety++ < 10) {
      id2 = randomOf(botIds);
    }
    if (id1 === id2) continue;

    const entry = randomOf(allPresets);
    const r = runOneGame(entry.series, entry.preset.id, entry.preset.id, randomSeed(), {
      bots: { p1: makeBot(id1), p2: makeBot(id2) },
      useMulligan: true,
      maxSteps: MAX_STEPS,
    });

    played++;

    if (!r.winner) {
      aborted++;
      console.warn(
        `[tournament] abort #${aborted}: ${id1} vs ${id2} on ${entry.preset.id} (turn ${r.turns})`,
      );
      continue;
    }

    const outcome = r.winner === 'p1' ? 'p1_win' : 'p2_win';
    const s1 = states.get(id1)!;
    const s2 = states.get(id2)!;

    const { p1: new1, p2: new2 } = updatePair(s1.rating, s2.rating, outcome);
    s1.rating = new1;
    s2.rating = new2;
    s1.matches++;
    s2.matches++;
    if (outcome === 'p1_win') {
      s1.wins++;
      s2.losses++;
    } else {
      s1.losses++;
      s2.wins++;
    }

    if ((i + 1) % 50 === 0 || i === TOTAL_MATCHES - 1) {
      console.log(
        `[tournament] ${i + 1}/${TOTAL_MATCHES} (aborted: ${aborted})`,
      );
    }
  }

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

  console.log(`\n[tournament] done. Played: ${played}, aborted: ${aborted}\n`);
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