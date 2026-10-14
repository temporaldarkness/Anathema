import { runSeries } from '../src/sim';

function usage(): never {
  console.error('Usage: simulate <packId> <p1DeckId> <p2DeckId> <N>');
  process.exit(1);
}

function main(): void {
  const args = process.argv.slice(2);
  let useMulligan = false;
  const cleaned: string[] = [];
  for (const a of args) {
    if (a === '--mulligan') useMulligan = true;
    else cleaned.push(a);
  }

  const [packId, p1DeckId, p2DeckId, nStr] = cleaned;
  if (!packId || !p1DeckId || !p2DeckId) usage();
  const n = Number.parseInt(nStr ?? '100', 10);
  if (!Number.isFinite(n) || n <= 0) usage();

  process.stdout.write(`  running ${n} games${useMulligan ? ' (mulligan)' : ''}…`);
  const r = runSeries({ packId, p1DeckId, p2DeckId, games: n, useMulligan });
  process.stdout.write('\r');

  const pct = (x: number) => ((x / r.games) * 100).toFixed(1).padStart(5);

  console.log('──────────────────────────────────────────────');
  console.log(`  Pack:      ${packId}`);
  console.log(`  P1 deck:   ${p1DeckId}`);
  console.log(`  P2 deck:   ${p2DeckId}`);
  console.log(`  Games:     ${r.games}`);
  console.log('──────────────────────────────────────────────');
  console.log(`  P1 wins:   ${r.p1Wins} (${pct(r.p1Wins)}%)`);
  console.log(`  P2 wins:   ${r.p2Wins} (${pct(r.p2Wins)}%)`);
  console.log(`  Draws:     ${r.draws} (${pct(r.draws)}%)`);
  console.log(`  Avg turns: ${r.avgTurns.toFixed(1)}`);
  console.log(`  Avg steps: ${r.avgSteps.toFixed(1)}`);
  console.log(
    `  Reasons:   ${
      Object.entries(r.reasons)
        .map(([k, v]) => `${k}=${v}`)
        .join('  ') || '—'
    }`,
  );
  if (r.hitLimitCount > 0) {
    console.log(`  ! hit step limit: ${r.hitLimitCount}`);
  }
  console.log(`  Time:      ${r.elapsedMs}ms`);
  console.log('──────────────────────────────────────────────');
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}