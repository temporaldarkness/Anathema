#!/usr/bin/env tsx
/**
 * CLI-симулятор «Аспектов Штормграда».
 * Запуск: pnpm --filter @aspects/engine cli [seed]
 *
 * Команды:
 *   status / s                    — показать доску
 *   hand / h                      — показать руку
 *   mulligan [<idx>]              — муллиган (без idx — оставить руку)
 *   play <handIdx> <column>       — разыграть карту
 *   replace <handIdx>             — заменить аспект
 *   ability <col> <f|r> <idx>     — активируемая способность карты
 *   attack <col> <f|r> <target>
 *       target: g (guild) | n (neutral) | c:<col>:<f|r> (card)
 *   next / n                      — продвинуть фазу
 *   end / e                       — завершить ход
 *   concede                       — сдаться
 *   discard <idx> ...             — сброс карт (END_TURN_DISCARD)
 *   choose <idx> ...              — выбор цели (EFFECT_TARGET_SELECTION)
 *   help                          — справка
 *   quit / q                      — выход
 */

import * as readline from 'node:readline';
import { createGame } from '../src/state/create';
import { applyCommand } from '../src/commands/applyCommand';
import {
  controlledCells,
  frontCount,
  health,
  strengthInBattle,
} from '../src/state/helpers';
import type { GameState } from '../src/types/state';
import type { CardInstanceId, ColumnIndex, PlayerId } from '../src/types/ids';
import { opponentOf } from '../src/types/ids';
import type { DeckPreset, CardDefinition } from '@aspects/cards';
import {
  getDecks,
  mergedCardsById,
  seriesOfDeck,
  getPersonalityName,
} from '@aspects/cards';

// ─── Подготовка ───

const seed = process.argv[2] ?? `cli-${Date.now()}`;
const allPresets = getDecks();

if (allPresets.length === 0) {
  console.error('Нет пресетов. Проверь packages/cards/src/data/presets.json');
  process.exit(1);
}

const deck1: DeckPreset = allPresets[0];
const deck2: DeckPreset = allPresets[1] ?? allPresets[0];

const series = [
  ...new Set([
    ...seriesOfDeck(deck1.cards),
    ...seriesOfDeck(deck2.cards),
  ]),
];

const DEFS: Record<string, CardDefinition> = mergedCardsById(series);

// ─── Утилиты ───

function defName(state: GameState, cardId: CardInstanceId): string {
  const card = state.cards[cardId];
  if (!card) return '?';
  return state.definitions[card.definitionId]?.name ?? card.definitionId;
}

function cardLabel(state: GameState, cardId: CardInstanceId): string {
  const card = state.cards[cardId];
  if (!card) return '?';
  const str = strengthInBattle(state, cardId);
  const hp = health(card);
  const flags: string[] = [];
  if (card.isToken) flags.push('T');
  if (card.exhausted) flags.push('!');
  if (card.shieldAvailable) flags.push('S');
  if (card.slowCounter > 0) flags.push('~');
  const flagStr = flags.length > 0 ? `[${flags.join('')}]` : '';
  return `${defName(state, cardId)} ${str}/${hp}${flagStr}`;
}

// ─── Рендер ───

function renderBoard(state: GameState): void {
  const W = {
    num: 3,
    p1res: 14,
    p1front: 18,
    neutral: 3,
    p2front: 18,
    p2res: 14,
  };

  const fmt = (s: string, w: number): string => {
    const chars = [...s];
    if (chars.length > w) {
      return chars.slice(0, w - 1).join('') + '…';
    }
    return s + ' '.repeat(w - chars.length);
  };

  const totalWidth =
    2 + W.num + 3 + W.p1res + 3 + W.p1front + 3 + W.neutral +
    3 + W.p2front + 3 + W.p2res;

  const sep = '─'.repeat(totalWidth);

  console.log('\n' + sep);
  console.log(
    '  ' + fmt('#', W.num) + ' │ ' +
    fmt('P1 RESERVE', W.p1res) + ' │ ' +
    fmt('P1 FRONT', W.p1front) + ' │ ' +
    fmt('N', W.neutral) + ' │ ' +
    fmt('P2 FRONT', W.p2front) + ' │ ' +
    fmt('P2 RESERVE', W.p2res),
  );
  console.log(sep);

  for (let i = 0; i < 5; i++) {
    const col = state.board[i];
    const p1R = fmt(col.p1Reserve ? cardLabel(state, col.p1Reserve) : '—', W.p1res);
    const p1F = fmt(col.p1Front ? cardLabel(state, col.p1Front) : '—', W.p1front);
    const neutral = fmt(
      col.neutralOwner === 'p1' ? 'P1' : col.neutralOwner === 'p2' ? 'P2' : '·',
      W.neutral,
    );
    const p2F = fmt(col.p2Front ? cardLabel(state, col.p2Front) : '—', W.p2front);
    const p2R = fmt(col.p2Reserve ? cardLabel(state, col.p2Reserve) : '—', W.p2res);

    console.log(
      '  ' + fmt(String(i + 1), W.num) + ' │ ' +
      p1R + ' │ ' + p1F + ' │ ' +
      neutral + ' │ ' +
      p2F + ' │ ' + p2R,
    );
  }

  console.log(sep);
  console.log('Флаги:  T токен  ! истощён  S щит  ~ замедлен');
  console.log('Бонусы колонок: 1=–1 cost  2=+1 сила  3=+1 влияние  4=+1 защита  5=+1 карта');
  console.log(sep);

  for (const p of ['p1', 'p2'] as PlayerId[]) {
    const pl = state.players[p];
    const marker = state.activePlayer === p ? '  ◄ АКТИВНЫЙ' : '';
    console.log(
      `${p.toUpperCase()}: Величие ${pl.glory}  │  Влияние ${pl.influence}  │  ` +
      `Рука ${pl.hand.length}  │  Колода ${pl.deck.length}  │  Сброс ${pl.discard.length}  │  ` +
      `Фронт ${frontCount(state, p)}  │  Клетки ${controlledCells(state, p)}${marker}`,
    );
  }
  console.log(`Ход ${state.turnNumber}  │  Фаза: ${state.phase}`);

  if (state.phase === 'MULLIGAN') {
    const picker: PlayerId = !state.mulliganDone.p1 ? 'p1' : 'p2';
    console.log(`─── Муллigan: выбирает ${picker.toUpperCase()} ───`);
  }
}

function renderHand(state: GameState): void {
  const p = state.activePlayer;
  const hand = state.players[p].hand;
  console.log(`\n─── Рука ${p.toUpperCase()} (${hand.length}) ───`);
  if (hand.length === 0) {
    console.log('  (пусто)');
    return;
  }
  hand.forEach((id, i) => {
    const card = state.cards[id];
    const def = state.definitions[card.definitionId];
    const str = card.baseStrength;
    const hp = health(card);
    const personality = getPersonalityName(def.personalityTag);
    const isAspect = def.name !== personality;
    const ab = def.abilities.length > 0 ? ` [${def.abilities.join(',')}]` : '';
    const act =
      def.activatedAbilities && def.activatedAbilities.length > 0
        ? ` ⚡x${def.activatedAbilities.length}`
        : '';
    const maybe =
      hand.some((other, j) => {
        if (i === j) return false;
        const od = state.definitions[state.cards[other].definitionId];
        return od.personalityTag === def.personalityTag;
      }) ? ' ★' : '';
    const nameDisplay = isAspect
      ? `${def.name} — ${personality}`
      : def.name;
    console.log(
      `  ${i}. ${nameDisplay} — cost ${def.cost}, ${str}/${hp}${ab}${act}${maybe}`,
    );
  });
  console.log('★ — есть дубликат личности в руке (можно менять с картой на столе)');
  console.log('⚡xN — N активируемых способностей (ability <col> <f|r> <idx>)');
}

function renderMulligan(state: GameState): void {
  if (state.phase !== 'MULLIGAN') return;
  const picker: PlayerId = !state.mulliganDone.p1 ? 'p1' : 'p2';
  const hand = state.players[picker].hand;
  console.log(`\n─── Стартовая рука ${picker.toUpperCase()} (${hand.length}) ───`);
  hand.forEach((id, i) => {
    const card = state.cards[id];
    const def = state.definitions[card.definitionId];
    const personality = getPersonalityName(def.personalityTag);
    const nameDisplay = def.name !== personality
      ? `${def.name} — ${personality}`
      : def.name;
    console.log(`  ${i}. ${nameDisplay} — cost ${def.cost}, ${def.strength}/${def.health}`);
  });
  console.log('Команда: mulligan <idx> (заменить карту) или mulligan (оставить руку)');
}

function renderPendingChoice(state: GameState): void {
  const choice = state.pendingChoice;
  if (!choice) return;
  console.log(`\n─── ❓ ТРЕБУЕТСЯ ВЫБОР ───`);

  if (choice.kind === 'END_TURN_DISCARD') {
    console.log(`Игрок ${choice.playerId.toUpperCase()} сбрасывает ${choice.count} карт(ы) из руки.`);
    const hand = state.players[choice.playerId].hand;
    hand.forEach((id, i) => {
      const def = state.definitions[state.cards[id].definitionId];
      console.log(`  ${i}. ${def.name}`);
    });
    console.log(`Команда: discard <idx> <idx> ... (ровно ${choice.count})`);
  } else if (choice.kind === 'EFFECT_TARGET_SELECTION') {
    console.log(`Игрок ${choice.playerId.toUpperCase()} выбирает цель (${choice.count}).`);
    choice.eligibleCardIds.forEach((id, i) => {
      const card = state.cards[id];
      if (!card) return;
      const def = state.definitions[card.definitionId];
      const owner = card.ownerId;
      const col = card.column ?? '?';
      const zone = card.zone === 'FRONT' ? 'Фронт' : 'Резерв';
      console.log(`  ${i}. ${def.name}  [${owner} · кол.${col} · ${zone}]`);
    });
    console.log(`Команда: choose <idx> <idx> ... (ровно ${choice.count})`);
  }
}

// ─── Парсинг команд ───

function resolveHand(
  state: GameState,
  index: number,
): { cardId: CardInstanceId } | null {
  const p = state.activePlayer;
  const hand = state.players[p].hand;
  if (index < 0 || index >= hand.length) return null;
  return { cardId: hand[index] };
}

function parseAttack(
  state: GameState,
  parts: string[],
): { attackerId: CardInstanceId; target: any } | { error: string } {
  if (parts.length < 4) {
    return { error: 'Используй: attack <col> <f|r> <g|n|c:col:f|r>' };
  }
  const col = parseInt(parts[1], 10) as ColumnIndex;
  const side = parts[2].toLowerCase();
  const targetKind = parts[3];

  if (col < 1 || col > 5) return { error: 'Колонка 1..5' };
  if (side !== 'f' && side !== 'r') return { error: 'side = f или r' };

  const active = state.activePlayer;
  const boardCol = state.board[col - 1];
  const attackerId =
    active === 'p1'
      ? side === 'f'
        ? boardCol.p1Front
        : boardCol.p1Reserve
      : side === 'f'
        ? boardCol.p2Front
        : boardCol.p2Reserve;

  if (!attackerId) return { error: 'В этом слоте нет карты' };

  if (targetKind === 'g') {
    return { attackerId, target: { kind: 'GUILD', playerId: opponentOf(active) } };
  }
  if (targetKind === 'n') {
    return { attackerId, target: { kind: 'NEUTRAL', column: col } };
  }
  if (targetKind.startsWith('c:')) {
    const [, tcol, tside] = targetKind.split(':');
    const tCol = parseInt(tcol, 10) as ColumnIndex;
    if (tCol < 1 || tCol > 5) return { error: 'Целевая колонка 1..5' };
    const opp = opponentOf(active);
    const targetCol = state.board[tCol - 1];
    const targetCardId =
      opp === 'p1'
        ? tside === 'f'
          ? targetCol.p1Front
          : targetCol.p1Reserve
        : tside === 'f'
          ? targetCol.p2Front
          : targetCol.p2Reserve;
    if (!targetCardId) return { error: 'В целевом слоте нет карты' };
    return { attackerId, target: { kind: 'CARD', cardId: targetCardId } };
  }
  return { error: 'Неизвестный тип цели' };
}

// ─── Обработка pending choice ───

function handlePendingChoiceInput(
  state: GameState,
  cmd: string,
  parts: string[],
): GameState | null {
  const choice = state.pendingChoice;
  if (!choice) return null;

  const isDiscard = choice.kind === 'END_TURN_DISCARD';
  const expectedCmd = isDiscard ? 'discard' : 'choose';
  const expectedAlt = isDiscard ? 'd' : 'c';

  if (cmd !== expectedCmd && cmd !== expectedAlt) {
    console.log(`Ожидается выбор. Используй: ${expectedCmd} <idx> ...`);
    return null;
  }

  const indices = parts.slice(1).map((s) => parseInt(s, 10));
  if (indices.length !== choice.count) {
    console.log(`Нужно ровно ${choice.count} индексов, дано ${indices.length}.`);
    return null;
  }

  const cardIds: CardInstanceId[] = [];
  const seen = new Set<number>();
  for (const idx of indices) {
    if (
      Number.isNaN(idx) ||
      idx < 0 ||
      idx >= choice.eligibleCardIds.length ||
      seen.has(idx)
    ) {
      console.log(`Неверный индекс: ${idx}.`);
      return null;
    }
    seen.add(idx);
    cardIds.push(choice.eligibleCardIds[idx]);
  }

  const r = applyCommand(state, {
    type: 'RESOLVE_CHOICE',
    playerId: choice.playerId,
    cardIds,
  });
  reportEvents(r.events);
  return r.state;
}

// ─── Обработка муллигана ───

function handleMulliganInput(
  state: GameState,
  cmd: string,
  parts: string[],
): GameState | null {
  if (state.phase !== 'MULLIGAN') return null;
  if (cmd !== 'mulligan' && cmd !== 'm') return null;

  const picker: PlayerId = !state.mulliganDone.p1 ? 'p1' : 'p2';
  const hand = state.players[picker].hand;

  let cardId: CardInstanceId | null = null;
  if (parts.length >= 2) {
    const idx = parseInt(parts[1], 10);
    if (Number.isNaN(idx) || idx < 0 || idx >= hand.length) {
      console.log('Неверный индекс карты.');
      return null;
    }
    cardId = hand[idx];
  }

  const r = applyCommand(state, {
    type: 'MULLIGAN',
    playerId: picker,
    cardId,
  });
  reportEvents(r.events);
  return r.state;
}

// ─── Main ───

function main(): void {
  const r = createGame({
    seed,
    decks: { p1: deck1.cards, p2: deck2.cards },
    cardDefinitions: DEFS,
    useMulligan: true,
  });
  let state: GameState = r.state;

  console.log(`Партия запущена. Seed: ${seed}`);
  console.log(`Серии: ${series.join(', ')}`);
  console.log(`P1: ${deck1.name} · P2: ${deck2.name}`);
  console.log('Напиши "help" для списка команд.');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> ',
  });

  const renderAll = (): void => {
    renderBoard(state);
    if (state.phase === 'MULLIGAN') {
      renderMulligan(state);
    }
    if (state.pendingChoice) renderPendingChoice(state);
  };

  renderAll();
  rl.prompt();

  rl.on('line', (line) => {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }
    const parts = input.split(/\s+/);
    const cmd = parts[0].toLowerCase();

    // Pending choice
    if (state.pendingChoice) {
      const next = handlePendingChoiceInput(state, cmd, parts);
      if (next) state = next;
      renderAll();
      rl.prompt();
      return;
    }

    // Mulligan
    if (state.phase === 'MULLIGAN') {
      const next = handleMulliganInput(state, cmd, parts);
      if (next) state = next;
      renderAll();
      rl.prompt();
      return;
    }

    if (state.winner) {
      console.log(`🏆 Игра окончена. Победил ${state.winner} (${state.winnerReason}).`);
      rl.prompt();
      return;
    }

    switch (cmd) {
      case 'help':
        console.log(
          [
            'status / s                       — показать доску',
            'hand / h                         — показать руку',
            'play <handIdx> <col>             — разыграть карту',
            'replace <handIdx>                — заменить аспект',
            'ability <col> <f|r> <idx>        — активируемая способность',
            'attack <col> <f|r> <target>      — атака (target: g|n|c:col:f|r)',
            'next / n                         — продвинуть фазу',
            'end / e                          — завершить ход',
            'concede                          — сдаться',
            'discard <idx> ...                — сброс карт (при END_TURN_DISCARD)',
            'choose <idx> ...                 — выбор целей (при EFFECT_TARGET_SELECTION)',
            'quit / q                         — выход',
          ].join('\n'),
        );
        break;

      case 'status':
      case 's':
        renderAll();
        break;

      case 'hand':
      case 'h':
        renderHand(state);
        break;

      case 'play': {
        if (parts.length < 3) {
          console.log('Используй: play <handIdx> <col>');
          break;
        }
        const idx = parseInt(parts[1], 10);
        const col = parseInt(parts[2], 10) as ColumnIndex;
        const ref = resolveHand(state, idx);
        if (!ref) {
          console.log('Нет такой карты в руке');
          break;
        }
        const r = applyCommand(state, {
          type: 'PLAY_CARD',
          playerId: state.activePlayer,
          cardId: ref.cardId,
          column: col,
        });
        state = r.state;
        reportEvents(r.events);
        break;
      }

      case 'replace': {
        if (parts.length < 2) {
          console.log('Используй: replace <handIdx>');
          break;
        }
        const idx = parseInt(parts[1], 10);
        const ref = resolveHand(state, idx);
        if (!ref) {
          console.log('Нет такой карты в руке');
          break;
        }
        const r = applyCommand(state, {
          type: 'REPLACE_CARD',
          playerId: state.activePlayer,
          cardId: ref.cardId,
        });
        state = r.state;
        reportEvents(r.events);
        break;
      }

      case 'ability': {
        if (parts.length < 4) {
          console.log('Используй: ability <col> <f|r> <idx>');
          break;
        }
        const col = parseInt(parts[1], 10) as ColumnIndex;
        const side = parts[2].toLowerCase();
        const idx = parseInt(parts[3], 10);
        if (col < 1 || col > 5) {
          console.log('Колонка 1..5');
          break;
        }
        if (side !== 'f' && side !== 'r') {
          console.log('side = f или r');
          break;
        }
        const active = state.activePlayer;
        const boardCol = state.board[col - 1];
        const cardId =
          active === 'p1'
            ? side === 'f'
              ? boardCol.p1Front
              : boardCol.p1Reserve
            : side === 'f'
              ? boardCol.p2Front
              : boardCol.p2Reserve;
        if (!cardId) {
          console.log('В этом слоте нет карты');
          break;
        }
        const r = applyCommand(state, {
          type: 'USE_ABILITY',
          playerId: active,
          cardId,
          abilityIndex: idx,
        });
        state = r.state;
        reportEvents(r.events);
        break;
      }

      case 'attack': {
        const parsed = parseAttack(state, parts);
        if ('error' in parsed) {
          console.log(parsed.error);
          break;
        }
        const r = applyCommand(state, {
          type: 'ATTACK',
          playerId: state.activePlayer,
          attackerId: parsed.attackerId,
          target: parsed.target,
        });
        state = r.state;
        reportEvents(r.events);
        break;
      }

      case 'next':
      case 'n': {
        const r = applyCommand(state, {
          type: 'ADVANCE_PHASE',
          playerId: state.activePlayer,
        });
        state = r.state;
        reportEvents(r.events);
        break;
      }

      case 'end':
      case 'e': {
        const r = applyCommand(state, {
          type: 'END_TURN',
          playerId: state.activePlayer,
        });
        state = r.state;
        reportEvents(r.events);
        break;
      }

      case 'concede': {
        if (state.winner) break;
        const opp = opponentOf(state.activePlayer);
        state = {
          ...state,
          winner: opp,
          winnerReason: 'concede',
        };
        console.log(`🏳 Сдача. Победил ${opp}.`);
        break;
      }

      case 'quit':
      case 'q':
        rl.close();
        return;

      default:
        console.log(`Неизвестная команда: ${cmd}. help — справка.`);
    }

    renderAll();
    rl.prompt();
  });

  rl.on('close', () => {
    console.log('Выход.');
    process.exit(0);
  });
}

function reportEvents(events: any[]): void {
  const relevant = events.filter(
    (e) =>
      e.type === 'COMMAND_REJECTED' ||
      e.type === 'GLORY_CHANGED' ||
      e.type === 'GAME_OVER' ||
      e.type === 'NEUTRAL_CAPTURED' ||
      e.type === 'NEUTRAL_LOST' ||
      e.type === 'CARD_REPLACED' ||
      e.type === 'CARD_DIED' ||
      e.type === 'TOKEN_SUMMONED' ||
      e.type === 'TOKEN_LOST' ||
      e.type === 'CHOICE_REQUESTED' ||
      e.type === 'CHOICE_RESOLVED' ||
      e.type === 'MULLIGAN_DONE',
  );
  for (const e of relevant) {
    if (e.type === 'COMMAND_REJECTED') {
      console.log(`❌ Отказ: ${e.reason}`);
    } else if (e.type === 'GLORY_CHANGED') {
      console.log(`💥 ${e.playerId}: Величие ${e.total}`);
    } else if (e.type === 'GAME_OVER') {
      console.log(`🏆 Победа: ${e.winner} (${e.reason})`);
    } else if (e.type === 'NEUTRAL_CAPTURED') {
      console.log(`🚩 Клетка ${e.column} → ${e.playerId}`);
    } else if (e.type === 'NEUTRAL_LOST') {
      console.log(`⚑ Клетка ${e.column}: потеряна ${e.formerOwner}`);
    } else if (e.type === 'CARD_REPLACED') {
      console.log(`🔄 Замена: ${e.oldCardId} → ${e.newCardId}`);
    } else if (e.type === 'CARD_DIED') {
      console.log(`💀 Карта ${e.cardId} ушла в сброс (${e.zone})`);
    } else if (e.type === 'TOKEN_SUMMONED') {
      console.log(`✨ Токен ${e.defId} призван в колонку ${e.column}`);
    } else if (e.type === 'TOKEN_LOST') {
      console.log(`⚠ Токен ${e.defId} потерян (${e.reason})`);
    } else if (e.type === 'MULLIGAN_DONE') {
      console.log(`🎴 ${e.playerId} ${e.replaced ? 'заменил карту' : 'оставил руку'}`);
    } else if (e.type === 'CHOICE_REQUESTED') {
      if (e.kind === 'END_TURN_DISCARD') {
        console.log(`❓ Выбор: сбросить ${e.count} карт(ы). Команда: discard <idx> ...`);
      } else if (e.kind === 'EFFECT_TARGET_SELECTION') {
        console.log(`❓ Выбор цели: ${e.count}. Команда: choose <idx> ...`);
      }
    } else if (e.type === 'CHOICE_RESOLVED') {
      console.log(`✔ Выбор сделан (${e.kind}).`);
    }
  }
}

main();