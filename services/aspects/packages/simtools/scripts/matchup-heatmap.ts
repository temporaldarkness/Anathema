#!/usr/bin/env tsx
/**
 * Цветная матрица winrate N×N.
 *
 * Usage:
 *   matchup-heatmap <scope> <N> [botName] [deck1,deck2,...] [--mulligan]
 *
 * Цвет:
 *   зелёный — P1 выигрывает > 60%
 *   жёлтый  — 40-60%
 *   красный — < 40%
 */

import { decksForScope, resolveScope, listScopes } from '@aspects/cards';
import { makeBot, listAllBotIds } from '@aspects/bot';
import { runSeries } from '../src/runner';
import type { Bot } from '@aspects/bot';

const DEFAULT_BOT = 'heuristic-v5-balanced-master';

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const BOLD = '\x1b[1m';

function colorize(wr: number): string {
  const pct = (wr * 100).toFixed(0);
  if (wr > 0.6) return `${GREEN}${pct}%${RESET}`;
  if (wr < 0.4) return `${RED}${pct}%${RESET}`;
  return `${YELLOW}${pct}%${RESET}`;
}

function parseArgs(argv: string[]) {
  const cleaned: string[] = [];
  let useMulligan = false;
  for (const a of argv) {
    if (a === '--mulligan') useMulligan = true;
    else cleaned.push(a);
  }
  const [scopeStr, nStr, arg3, arg4] = cleaned;
  if (!scopeStr || !nStr) {
    console.error('Usage: matchup-heatmap <scope> <N> [botName] [deck1,deck2,...] [--mulligan]');
    process.exit(1);
  }
  const series = resolveScope(scopeStr);
  if (series.length === 0) {
    console.error(`Empty scope. Known: ${listScopes().map((s) => s.id).join(', ')}`);
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
      console.error(`Unknown bot "${arg3}".`);
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
  return { scopeStr, series, n, botName, deckIds, useMulligan };
}

// Считаем «визуальную ширину» строки без ANSI
function visibleWidth(s: string): number {
  return s.replace(/\x1b\[[0-9;]*m/g, '').length;
}

function padVisible(s: string, w: number): string {
  const cur = visibleWidth(s);
  return cur >= w ? s : s + ' '.repeat(w - cur);
}

function main(): void {
  const { scopeStr, series, n, botName, deckIds, useMulligan } = parseArgs(
    process.argv.slice(2),
  );
  const mkBot = (): Bot => makeBot(botName);

  console.log(`Matchup heatmap: scope=[${series.join(', ')}], bot=${botName}${useMulligan ? ' (+mulligan)' : ''}\n`);

  const cells = new Map<string, { wr: number; turns: number }>();
  const total = deckIds.length * deckIds.length;
  let done = 0;
  const t0 = Date.now();

  for (const p1 of deckIds) {
    for (const p2 of deckIds) {
      const r = runSeries({
        series,
        p1DeckId: p1,
        p2DeckId: p2,
        games: n,
        useMulligan,
        botFactories: { p1: mkBot, p2: mkBot },
      });
      cells.set(`${p1}|${p2}`, {
        wr: r.p1Wins / r.games,
        turns: r.avgTurns,
      });
      done++;
      process.stdout.write(`\r  running ${done}/${total} … (${p1} vs ${p2})          `);
    }
  }
  process.stdout.write('\r');

  const cellW = 12;
  const labelW = 14;

  // Header
  let header = ' '.repeat(labelW) + BOLD + '│' + RESET;
  for (const d of deckIds) {
    header += padVisible(d.slice(0, cellW - 1), cellW) + ' ';
  }
  console.log(header);
  console.log('─'.repeat(labelW) + '┼' + deckIds.map(() => '─'.repeat(cellW)).join(' '));

  for (const p1 of deckIds) {
    let row = BOLD + padVisible(p1, labelW) + RESET + '│';
    for (const p2 of deckIds) {
      const c = cells.get(`${p1}|${p2}`)!;
      const cell = `${colorize(c.wr)} ${DIM}${c.turns.toFixed(0)}t${RESET}`;
      row += padVisible(cell, cellW) + ' ';
    }
    console.log(row);
  }

  console.log('');
  console.log(`${GREEN}■${RESET} >60%  ${YELLOW}■${RESET} 40-60%  ${RED}■${RESET} <40%`);
  console.log(`${DIM}XXt = средняя длина партии в ходах${RESET}`);
  console.log(`\nTime: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}