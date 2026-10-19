#!/usr/bin/env tsx
/**
 * Attack efficiency: куда уходят атаки, насколько они эффективны.
 *
 * Usage:
 *   attack-efficiency <scope> <N> [botName] [deck1,deck2,...] [--mulligan]
 */

import type { GameState, CardInstanceId } from '@aspects/engine';
import { health, strengthInBattle } from '@aspects/engine';
import { decksForScope, resolveScope, listScopes } from '@aspects/cards';
import { makeBot, listAllBotIds } from '@aspects/bot';
import { runOneGameRaw } from '../src/runner';

const DEFAULT_BOT = 'heuristic-v5-balanced-master';

function parseArgs(argv: string[]) {
  const cleaned: string[] = [];
  let useMulligan = false;
  for (const a of argv) {
    if (a === '--mulligan') useMulligan = true;
    else cleaned.push(a);
  }
  const [scopeStr, nStr, arg3, arg4] = cleaned;
  if (!scopeStr || !nStr) {
    console.error('Usage: attack-efficiency <scope> <N> [botName] [deck1,deck2,...] [--mulligan]');
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
      console.error(`Unknown bot "${arg3}". Known: ${botIds.join(', ')}`);
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

// ─── Категории атак ───

type AttackCategory =
  | 'guild'               // атака по гильдии
  | 'neutral'             // атака по нейтралу
  | 'kill'                // защитник убит, атакующий жив
  | 'trade'               // оба умерли
  | 'chip'                // защитник выжил, атакующий выжил (chip-урон)
  | 'suicide'             // атакующий умер, защитник выжил
  | 'shield_blocked';     // защитник со щитом поглотил всё

interface AttackInfo {
  category: AttackCategory;
  attackerStrength: number;
  damageToGuild: number; // только для guild
  defenderHpBefore: number;
  defenderHpAfter: number;
}

interface GameStats {
  attacks: AttackInfo[];
}

function categorizeAttack(
  stateBefore: GameState,
  stateAfter: GameState,
  attackerId: CardInstanceId,
  targetKind: 'guild' | 'neutral' | 'card',
  targetCardId?: CardInstanceId,
): AttackInfo {
  const attackerBefore = stateBefore.cards[attackerId];
  const attackerAfter = stateAfter.cards[attackerId];
  const attackerStrength = attackerBefore ? strengthInBattle(stateBefore, attackerId) : 0;

  if (targetKind === 'guild') {
    return {
      category: 'guild',
      attackerStrength,
      damageToGuild: attackerStrength,
      defenderHpBefore: 0,
      defenderHpAfter: 0,
    };
  }

  if (targetKind === 'neutral') {
    return {
      category: 'neutral',
      attackerStrength,
      damageToGuild: 0,
      defenderHpBefore: 0,
      defenderHpAfter: 0,
    };
  }

  // targetKind === 'card'
  const defenderBefore = targetCardId ? stateBefore.cards[targetCardId] : null;
  const defenderAfter = targetCardId ? stateAfter.cards[targetCardId] : null;
  const defenderHpBefore = defenderBefore ? health(defenderBefore) : 0;
  const defenderHpAfter = defenderAfter ? Math.max(0, health(defenderAfter)) : 0;

  const defenderDied = !defenderAfter || defenderAfter.zone === 'DISCARD';
  const attackerDied = !attackerAfter || attackerAfter.zone === 'DISCARD';

  // Проверка на shield-blocked: защитник имел щит до, а атака не нанесла урона
  const hadShield = defenderBefore?.shieldAvailable ?? false;
  const shieldBlocked = hadShield && defenderHpBefore === defenderHpAfter;

  if (shieldBlocked && !defenderDied) {
    return {
      category: 'shield_blocked',
      attackerStrength,
      damageToGuild: 0,
      defenderHpBefore,
      defenderHpAfter,
    };
  }
  if (defenderDied && !attackerDied) {
    return { category: 'kill', attackerStrength, damageToGuild: 0, defenderHpBefore, defenderHpAfter };
  }
  if (defenderDied && attackerDied) {
    return { category: 'trade', attackerStrength, damageToGuild: 0, defenderHpBefore, defenderHpAfter };
  }
  if (!defenderDied && attackerDied) {
    return { category: 'suicide', attackerStrength, damageToGuild: 0, defenderHpBefore, defenderHpAfter };
  }
  return { category: 'chip', attackerStrength, damageToGuild: 0, defenderHpBefore, defenderHpAfter };
}

function collectOneGame(
  series: string[],
  p1Cards: string[],
  p2Cards: string[],
  seed: string,
  botName: string,
  useMulligan: boolean,
): GameStats | null {
  const stats: GameStats = { attacks: [] };

  let stateBeforeAttack: GameState | null = null;
  let pendingAttackerId: CardInstanceId | null = null;
  let pendingTargetKind: 'guild' | 'neutral' | 'card' | null = null;
  let pendingTargetCardId: CardInstanceId | null = null;

  const r = runOneGameRaw(series, p1Cards, p2Cards, seed, {
    bots: { p1: makeBot(botName), p2: makeBot(botName) },
    useMulligan,
    onAfterCommand: (state, cmd, events) => {
      // Если предыдущая команда была ATTACK — категоризируем
      if (
        pendingAttackerId &&
        pendingTargetKind &&
        stateBeforeAttack
      ) {
        const info = categorizeAttack(
          stateBeforeAttack,
          state,
          pendingAttackerId,
          pendingTargetKind,
          pendingTargetCardId ?? undefined,
        );
        stats.attacks.push(info);
        pendingAttackerId = null;
        pendingTargetKind = null;
        pendingTargetCardId = null;
        stateBeforeAttack = null;
      }

      // Если текущая команда — ATTACK, запоминаем
      if (cmd.type === 'ATTACK') {
        // State передан уже после applyCommand — нет before. Используем эвристику.
        // Но у нас нет stateBefore. Придётся переделать через state_updates.
        // Проще: используем сам факт команды и разбираем в следующем вызове.
        // Проблема в том, что state — это уже после.
        //
        // Обход: сохраняем cmd и обрабатываем через события events, которые
        // содержат CARD_DIED, DAMAGE_DEALT с деталями.

        // Упрощение: категоризируем по событиям
        if (cmd.target.kind === 'GUILD') {
          const gloryEvents = events.filter((e) => e.type === 'GLORY_CHANGED' && e.delta < 0);
          const dmg = gloryEvents.reduce((a, e) => a + Math.abs((e as any).delta), 0);
          stats.attacks.push({
            category: 'guild',
            attackerStrength: dmg,
            damageToGuild: dmg,
            defenderHpBefore: 0,
            defenderHpAfter: 0,
          });
        } else if (cmd.target.kind === 'NEUTRAL') {
          stats.attacks.push({
            category: 'neutral',
            attackerStrength: 0,
            damageToGuild: 0,
            defenderHpBefore: 0,
            defenderHpAfter: 0,
          });
        } else {
          // target.kind === 'CARD'
          const defenderCard = state.cards[cmd.target.cardId];
          const defenderDied = !defenderCard || defenderCard.zone === 'DISCARD';
          const attackerCard = state.cards[cmd.attackerId];
          const attackerDied = !attackerCard || attackerCard.zone === 'DISCARD';
        
          // Щит: проверяем через события, а не через состояние.
          // SHIELD_ABSORBED эмитится в damageCard при поглощении.
          const shieldBlocked = events.some((e) => e.type === 'SHIELD_ABSORBED');
        
          if (shieldBlocked) {
            // Классифицируем по факту щита, независимо от исхода боя.
            // Attacker мог выжить (chip) или умереть (suicide) — но
            // его атака "утонула" в щите.
            stats.attacks.push({
              category: 'shield_blocked',
              attackerStrength: 0,
              damageToGuild: 0,
              defenderHpBefore: 0,
              defenderHpAfter: 0,
            });
          } else if (defenderDied && !attackerDied) {
            stats.attacks.push({ category: 'kill', ... });
          } else if (defenderDied && attackerDied) {
            stats.attacks.push({ category: 'trade', ... });
          } else if (!defenderDied && attackerDied) {
            stats.attacks.push({ category: 'suicide', ... });
          } else {
            stats.attacks.push({ category: 'chip', ... });
          }
        }
      }
    },
  });

  if (!r) return null;
  return stats;
}

// ─── main ───

function pad(s: string, w: number): string {
  return s.length >= w ? s : s + ' '.repeat(w - s.length);
}

function pct(x: number, total: number): string {
  if (total === 0) return '  n/a';
  return `${((x / total) * 100).toFixed(1)}%`;
}

function main(): void {
  const { scopeStr, series, n, botName, deckIds, useMulligan } = parseArgs(
    process.argv.slice(2),
  );
  const decks = decksForScope(scopeStr).filter((d) => deckIds.includes(d.id));

  console.log('═══════════════════════════════════════════════════');
  console.log(`  Attack efficiency`);
  console.log(`  Scope:  ${scopeStr} [${series.join(', ')}]`);
  console.log(`  Bot:    ${botName}${useMulligan ? ' (+ mulligan)' : ''}`);
  console.log(`  Decks:  ${deckIds.join(', ')}`);
  console.log(`  Games:  ${n} per pair`);
  console.log('═══════════════════════════════════════════════════\n');

  const pairs: Array<[string, string]> = [];
  for (const a of deckIds) for (const b of deckIds) pairs.push([a, b]);

  const all: GameStats[] = [];
  const total = pairs.length * n;
  let done = 0;
  const t0 = Date.now();

  for (const [d1, d2] of pairs) {
    const cards1 = decks.find((d) => d.id === d1)!.cards;
    const cards2 = decks.find((d) => d.id === d2)!.cards;
    for (let i = 0; i < n; i++) {
      const seed = `ae-${d1}-${d2}-${i}`;
      const s = collectOneGame(series, [...cards1], [...cards2], seed, botName, useMulligan);
      if (s) all.push(s);
      done++;
      if (done % 50 === 0) {
        process.stdout.write(`\r  running ${done}/${total} …          `);
      }
    }
  }
  process.stdout.write('\r');

  const allAttacks = all.flatMap((s) => s.attacks);
  const totalAttacks = allAttacks.length;

  const counts: Record<AttackCategory, number> = {
    guild: 0, neutral: 0, kill: 0, trade: 0, chip: 0, suicide: 0, shield_blocked: 0,
  };
  let totalGuildDamage = 0;
  for (const a of allAttacks) {
    counts[a.category]++;
    if (a.category === 'guild') totalGuildDamage += a.damageToGuild;
  }

  console.log('─── Распределение атак по категориям ──────────');
  console.log(`  Всего атак:        ${totalAttacks}`);
  console.log('');
  console.log(`  По гильдии:        ${pad(String(counts.guild), 6)} (${pct(counts.guild, totalAttacks)})`);
  console.log(`  По нейтралам:      ${pad(String(counts.neutral), 6)} (${pct(counts.neutral, totalAttacks)})`);
  console.log(`  Убийство (kill):   ${pad(String(counts.kill), 6)} (${pct(counts.kill, totalAttacks)})  — защитник умер, атакующий жив`);
  console.log(`  Размен (trade):    ${pad(String(counts.trade), 6)} (${pct(counts.trade, totalAttacks)})  — оба умерли`);
  console.log(`  Чип (chip):        ${pad(String(counts.chip), 6)} (${pct(counts.chip, totalAttacks)})  — оба выжили`);
  console.log(`  Суицид (suicide):  ${pad(String(counts.suicide), 6)} (${pct(counts.suicide, totalAttacks)})  — атакующий умер, защитник выжил`);
  console.log(`  Поглощён щитом:    ${pad(String(counts.shield_blocked), 6)} (${pct(counts.shield_blocked, totalAttacks)})`);
  console.log('');

  console.log('─── Урон по гильдии ───────────────────────────');
  console.log(`  Всего урона:       ${totalGuildDamage}`);
  console.log(`  На партию:         ${(totalGuildDamage / all.length).toFixed(1)}`);
  console.log(`  Средний удар:      ${(totalGuildDamage / Math.max(1, counts.guild)).toFixed(1)}`);
  console.log(`  Glory:             30`);
  console.log(`  Атак на убийство:  ${(30 / Math.max(0.01, totalGuildDamage / all.length)).toFixed(1)} (при среднем ударе)`);
  console.log('');

  // ─── Интерпретация ───
  console.log('─── Интерпретация ─────────────────────────────');
  const chipRatio = counts.chip / totalAttacks;
  const killRatio = counts.kill / totalAttacks;
  const tradeRatio = counts.trade / totalAttacks;
  const suicideRatio = counts.suicide / totalAttacks;
  const neutralRatio = counts.neutral / totalAttacks;

  if (chipRatio > 0.4) {
    console.log(`  ⚠ ${(chipRatio * 100).toFixed(0)}% атак — чип-урон (никто не умирает).`);
    console.log('    Атаки не решают, только тратят ресурс. Attrition.');
  }
  if (tradeRatio + killRatio < 0.3) {
    console.log(`  Только ${((tradeRatio + killRatio) * 100).toFixed(0)}% атак — результативные (kill/trade).`);
    console.log('    Большинство атак не решают судьбу защитника.');
  }
  if (suicideRatio > 0.1) {
    console.log(`  ⚠ ${(suicideRatio * 100).toFixed(0)}% атак — суицид (атакующий умер зря).`);
    console.log('    Бот плохо оценивает размен.');
  }
  if (neutralRatio > 0.3) {
    console.log(`  ⚠ ${(neutralRatio * 100).toFixed(0)}% атак — по нейтралам.`);
    console.log('    Бот переоценивает клетки, тратит на них много атак.');
  }
  
  const shieldRatio = counts.shield_blocked / totalAttacks;
  if (shieldRatio > 0.05) {
    console.log(`  ⚠ ${(shieldRatio * 100).toFixed(1)}% атак — утонули в щите.`);
    console.log('    Проверить: scoreAttackHeur учитывает shieldBlocks?');
    console.log('    Если да — бот ошибается. Если нет — добавить.');
  }

  const attacksToKill = 30 / Math.max(0.01, totalGuildDamage / all.length);
  if (attacksToKill > 15) {
    console.log(`  ⚠ ${attacksToKill.toFixed(1)} атак по гильдии нужно для убийства.`);
    console.log('    Урон по гильдии слишком маленький относительно glory.');
    console.log('    Гипотеза H4 (нет дожатия) подтверждается.');
  } else {
    console.log(`  ${attacksToKill.toFixed(1)} атак по гильдии на убийство — норм.`);
  }

  console.log('');
  console.log(`─── Time: ${((Date.now() - t0) / 1000).toFixed(1)}s ───────────────────`);
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}