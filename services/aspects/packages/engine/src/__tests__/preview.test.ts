import { describe, it, expect } from 'vitest';
import { createGame } from '../state/create';
import { applyCommand } from '../commands/applyCommand';
import { allCardIds } from '../state/helpers';
import {
  previewCardAttack,
  getValidAttackTargets,
  simulateAttack,
  simulateAttackFully,
  simulateAttackChain,
} from '../state/preview';
import type { CardDefinition } from '@aspects/cards';
import type { GameState } from '../types/state';
import type { ColumnIndex, PlayerId, CardInstanceId } from '../types/ids';
import { opponentOf } from '../types/ids';

// ─────────────────────────────────────────────────────
// Определения для тестов
// ─────────────────────────────────────────────────────

const defs: Record<string, CardDefinition> = {
  plain: {
    id: 'plain', name: 'Простой', personalityTag: 'plain', tags: [],
    cost: 1, strength: 2, health: 3, rarity: 'common',
    abilities: [], triggers: [], activatedAbilities: [],
  } as any,
  shielded: {
    id: 'shielded', name: 'Щитоносец', personalityTag: 'shielded', tags: [],
    cost: 1, strength: 1, health: 4, rarity: 'common',
    abilities: ['shield'], triggers: [], activatedAbilities: [],
  } as any,
  breaker: {
    id: 'breaker', name: 'Берсерк', personalityTag: 'breaker', tags: [],
    cost: 1, strength: 5, health: 2, rarity: 'common',
    abilities: ['breakthrough'], triggers: [], activatedAbilities: [],
  } as any,
  weakling: {
    id: 'weakling', name: 'Слабыш', personalityTag: 'weakling', tags: [],
    cost: 1, strength: 1, health: 1, rarity: 'common',
    abilities: [], triggers: [], activatedAbilities: [],
  } as any,
  dummy: {
    id: 'dummy', name: 'Манекен', personalityTag: 'dummy', tags: [],
    cost: 3, strength: 3, health: 3, rarity: 'common',
    abilities: [], triggers: [], activatedAbilities: [],
  } as any,
};

// 6 разных личностей × 5 копий = 30 карт.
const deck = [
  ...Array(5).fill('plain'),
  ...Array(5).fill('shielded'),
  ...Array(5).fill('breaker'),
  ...Array(5).fill('weakling'),
  ...Array(5).fill('dummy'),
  ...Array(5).fill('plain'),
];

// ─────────────────────────────────────────────────────
// Хелперы
// ─────────────────────────────────────────────────────

function setup(seed = 'preview-test'): GameState {
  let s = createGame({
    seed,
    decks: { p1: deck, p2: deck },
    cardDefinitions: defs,
    useMulligan: false,
  }).state;
  while (s.phase !== 'PLAY' && !s.pendingChoice) {
    s = applyCommand(s, { type: 'ADVANCE_PHASE', playerId: s.activePlayer }).state;
  }
  return s;
}

function place(
  state: GameState,
  pid: PlayerId,
  defId: string,
  col: ColumnIndex,
  zone: 'FRONT' | 'RESERVE' = 'FRONT',
): { state: GameState; cardId: CardInstanceId } {
  const pool = [...state.players[pid].hand, ...state.players[pid].deck];
  const cid = pool.find((id) => state.cards[id].definitionId === defId);
  if (!cid) throw new Error(`No ${defId} for ${pid}`);
  const nb = state.board.map((c) => ({ ...c }));
  const targetCol = nb[col - 1];
  if (pid === 'p1') {
    if (zone === 'FRONT') targetCol.p1Front = cid;
    else targetCol.p1Reserve = cid;
  } else {
    if (zone === 'FRONT') targetCol.p2Front = cid;
    else targetCol.p2Reserve = cid;
  }
  return {
    state: {
      ...state,
      board: nb,
      cards: { ...state.cards, [cid]: { ...state.cards[cid], zone, column: col } },
      players: {
        ...state.players,
        [pid]: {
          ...state.players[pid],
          hand: state.players[pid].hand.filter((i) => i !== cid),
          deck: state.players[pid].deck.filter((i) => i !== cid),
        },
      },
    },
    cardId: cid,
  };
}

function advanceToCombat(state: GameState): GameState {
  let s = state;
  while (s.phase !== 'COMBAT' && !s.pendingChoice && !s.winner) {
    s = applyCommand(s, { type: 'ADVANCE_PHASE', playerId: s.activePlayer }).state;
  }
  return s;
}

// ─────────────────────────────────────────────────────
// previewCardAttack
// ─────────────────────────────────────────────────────

describe('previewCardAttack', () => {
  it('возвращает null для несуществующих карт', () => {
    const s = setup();
    expect(previewCardAttack(s, 'nope' as any, 'nope2' as any)).toBeNull();
  });

  it('симметричный обмен: 2/3 бьёт 2/3 — обе получают по 2', () => {
    let s = setup();
    const active = s.activePlayer;
    const opp = opponentOf(active);

    const a = place(s, active, 'plain', 1);
    s = a.state;
    const d = place(s, opp, 'plain', 1);
    s = d.state;

    const preview = previewCardAttack(s, a.cardId, d.cardId);
    expect(preview).not.toBeNull();
    expect(preview!.damageToDefender).toBe(2);
    expect(preview!.damageToAttacker).toBe(2);
    expect(preview!.defenderHpAfter).toBe(1);
    expect(preview!.attackerHpAfter).toBe(1);
    expect(preview!.attackerDies).toBe(false);
    expect(preview!.defenderDies).toBe(false);
    expect(preview!.shieldBlocks).toBe(false);
  });

  it('щит защитника полностью поглощает урон', () => {
    let s = setup();
    const active = s.activePlayer;
    const opp = opponentOf(active);

    const a = place(s, active, 'plain', 1);
    s = a.state;
    const d = place(s, opp, 'shielded', 1);
    s = d.state;

    const preview = previewCardAttack(s, a.cardId, d.cardId);
    expect(preview!.shieldBlocks).toBe(true);
    expect(preview!.damageToDefender).toBe(0);
    expect(preview!.defenderHpAfter).toBe(4);
    // Атакующий получил ответку.
    expect(preview!.damageToAttacker).toBe(1);
  });

  it('Прорыв: избыток урона считается, если защитник умирает', () => {
    let s = setup();
    const active = s.activePlayer;
    const opp = opponentOf(active);

    const a = place(s, active, 'breaker', 1);
    s = a.state;
    const d = place(s, opp, 'weakling', 1);
    s = d.state;

    const preview = previewCardAttack(s, a.cardId, d.cardId);
    expect(preview!.defenderDies).toBe(true);
    expect(preview!.hasBreakthrough).toBe(true);
    expect(preview!.overkillToReserve).toBe(4); // 5 силы - 1 hp = 4
    expect(preview!.defenderHpAfter).toBe(-4);
  });

  it('без Прорыва overkillToReserve = 0', () => {
    let s = setup();
    const active = s.activePlayer;
    const opp = opponentOf(active);

    const a = place(s, active, 'plain', 1);
    s = a.state;
    const d = place(s, opp, 'weakling', 1);
    s = d.state;

    const preview = previewCardAttack(s, a.cardId, d.cardId);
    expect(preview!.defenderDies).toBe(true);
    expect(preview!.hasBreakthrough).toBe(false);
    expect(preview!.overkillToReserve).toBe(0);
  });

  it('взаимная смерть: слабыш vs слабыш', () => {
    let s = setup();
    const active = s.activePlayer;
    const opp = opponentOf(active);

    const a = place(s, active, 'weakling', 1);
    s = a.state;
    const d = place(s, opp, 'weakling', 1);
    s = d.state;

    const preview = previewCardAttack(s, a.cardId, d.cardId);
    expect(preview!.attackerDies).toBe(true);
    expect(preview!.defenderDies).toBe(true);
  });

  it('защита колонки 4 снижает входящий урон на 1', () => {
    let s = setup();
    const active = s.activePlayer;
    const opp = opponentOf(active);

    // У противника нейтрал колонки 4.
    const nb = s.board.map((c) => ({ ...c }));
    nb[3].neutralOwner = opp;
    s = { ...s, board: nb };

    const a = place(s, active, 'plain', 1);
    s = a.state;
    const d = place(s, opp, 'plain', 1);
    s = d.state;

    const preview = previewCardAttack(s, a.cardId, d.cardId);
    // 2 силы - 1 защита = 1 урон.
    expect(preview!.damageToDefender).toBe(1);
  });
});

// ─────────────────────────────────────────────────────
// getValidAttackTargets
// ─────────────────────────────────────────────────────

describe('getValidAttackTargets', () => {
  it('в PLAY-фазе возвращает пустой массив', () => {
    const s = setup();
    const active = s.activePlayer;
    const attackerId = allCardIds(s).find(
      (id) => s.cards[id].ownerId === active,
    );
    if (!attackerId) return;
    expect(getValidAttackTargets(s, attackerId as any)).toEqual([]);
  });

  it('в COMBAT возвращает вражеские карты', () => {
    let s = setup();
    const active = s.activePlayer;
    const opp = opponentOf(active);

    const a = place(s, active, 'plain', 1);
    s = a.state;
    const d = place(s, opp, 'plain', 1);
    s = d.state;

    s = advanceToCombat(s);

    const targets = getValidAttackTargets(s, a.cardId);
    expect(targets.length).toBeGreaterThan(0);
    expect(
      targets.some((t) => t.kind === 'CARD' && t.cardId === d.cardId),
    ).toBe(true);
  });

  it('истощённая карта не имеет целей', () => {
    let s = setup();
    const active = s.activePlayer;

    const a = place(s, active, 'plain', 1);
    s = a.state;
    s = {
      ...s,
      cards: { ...s.cards, [a.cardId]: { ...s.cards[a.cardId], exhausted: true } },
    };
    s = advanceToCombat(s);

    expect(getValidAttackTargets(s, a.cardId)).toEqual([]);
  });

  it('включает атаку по гильдии, если фронт врага пуст', () => {
    let s = setup();
    const active = s.activePlayer;
    const opp = opponentOf(active);

    const a = place(s, active, 'plain', 1);
    s = a.state;

    s = advanceToCombat(s);

    const targets = getValidAttackTargets(s, a.cardId);
    expect(targets.some((t) => t.kind === 'GUILD' && t.playerId === opp)).toBe(true);
  });

  it('включает атаку по нейтралу в колонке атакующего', () => {
    let s = setup();
    const active = s.activePlayer;

    const a = place(s, active, 'plain', 3);
    s = a.state;

    s = advanceToCombat(s);

    const targets = getValidAttackTargets(s, a.cardId);
    expect(
      targets.some((t) => t.kind === 'NEUTRAL' && t.column === 3),
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────────────
// simulateAttack
// ─────────────────────────────────────────────────────

describe('simulateAttack', () => {
  it('возвращает null вне COMBAT', () => {
    const s = setup();
    const active = s.activePlayer;
    const attackerId = allCardIds(s).find(
      (id) => s.cards[id].ownerId === active,
    );
    if (!attackerId) return;
    const result = simulateAttack(s, attackerId as any, {
      kind: 'GUILD',
      playerId: opponentOf(active),
    });
    expect(result).toBeNull();
  });

  it('возвращает новый state при легальной атаке', () => {
    let s = setup();
    const active = s.activePlayer;
    const opp = opponentOf(active);

    const a = place(s, active, 'plain', 1);
    s = a.state;
    const d = place(s, opp, 'weakling', 1);
    s = d.state;

    s = advanceToCombat(s);

    const result = simulateAttack(s, a.cardId, { kind: 'CARD', cardId: d.cardId });
    expect(result).not.toBeNull();
    expect(result!.state).not.toBe(s);
    expect(result!.state.cards[d.cardId].zone).toBe('DISCARD');
    expect(result!.state.cards[a.cardId].exhausted).toBe(true);
  });

  it('не мутирует исходный state', () => {
    let s = setup();
    const active = s.activePlayer;
    const opp = opponentOf(active);

    const a = place(s, active, 'plain', 1);
    s = a.state;
    const d = place(s, opp, 'weakling', 1);
    s = d.state;

    s = advanceToCombat(s);
    const snapshot = JSON.stringify(s);

    simulateAttack(s, a.cardId, { kind: 'CARD', cardId: d.cardId });

    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it('возвращает null, если игра уже окончена', () => {
    let s = setup();
    s = { ...s, winner: 'p1', winnerReason: 'glory_zero' };
    expect(simulateAttack(s, 'any' as any, { kind: 'GUILD', playerId: 'p2' })).toBeNull();
  });
});

// ─────────────────────────────────────────────────────
// simulateAttackFully
// ─────────────────────────────────────────────────────

describe('simulateAttackFully', () => {
  it('возвращает state без pendingChoice', () => {
    let s = setup();
    const active = s.activePlayer;
    const opp = opponentOf(active);

    const a = place(s, active, 'plain', 1);
    s = a.state;
    const d = place(s, opp, 'weakling', 1);
    s = d.state;

    s = advanceToCombat(s);

    const result = simulateAttackFully(s, a.cardId, {
      kind: 'CARD',
      cardId: d.cardId,
    });
    expect(result).not.toBeNull();
    expect(result!.state.pendingChoice).toBeNull();
  });
});

// ─────────────────────────────────────────────────────
// simulateAttackChain
// ─────────────────────────────────────────────────────

describe('simulateAttackChain', () => {
  it('пустая цепочка возвращает исходный state', () => {
    const s = setup();
    const result = simulateAttackChain(s, []);
    expect(result.state).toBe(s);
    expect(result.broken).toBe(false);
  });

  it('цепочка из двух атак', () => {
    let s = setup();
    const active = s.activePlayer;
    const opp = opponentOf(active);

    const a1 = place(s, active, 'plain', 1);
    s = a1.state;
    const a2 = place(s, active, 'plain', 2);
    s = a2.state;
    const d1 = place(s, opp, 'weakling', 1);
    s = d1.state;
    const d2 = place(s, opp, 'weakling', 2);
    s = d2.state;

    s = advanceToCombat(s);

    const result = simulateAttackChain(s, [
      { attackerId: a1.cardId, target: { kind: 'CARD', cardId: d1.cardId } },
      { attackerId: a2.cardId, target: { kind: 'CARD', cardId: d2.cardId } },
    ]);

    expect(result.broken).toBe(false);
    expect(result.state.cards[d1.cardId].zone).toBe('DISCARD');
    expect(result.state.cards[d2.cardId].zone).toBe('DISCARD');
    expect(result.state.cards[a1.cardId].exhausted).toBe(true);
    expect(result.state.cards[a2.cardId].exhausted).toBe(true);
  });

  it('цепочка помечается broken, если одна атака нелегальна', () => {
    let s = setup();
    const active = s.activePlayer;
    const opp = opponentOf(active);

    const a1 = place(s, active, 'plain', 1);
    s = a1.state;
    const d1 = place(s, opp, 'weakling', 1);
    s = d1.state;

    s = advanceToCombat(s);

    // Вторая атака — тем же атакующим (уже истощён).
    const result = simulateAttackChain(s, [
      { attackerId: a1.cardId, target: { kind: 'CARD', cardId: d1.cardId } },
      { attackerId: a1.cardId, target: { kind: 'GUILD', playerId: opp } },
    ]);
    expect(result.broken).toBe(true);
    expect(result.state.cards[d1.cardId].zone).toBe('DISCARD');
  });
});