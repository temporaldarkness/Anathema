import { describe, it, expect } from 'vitest';
import {
  validateDeck,
  DECK_SIZE,
  MAX_COPIES_PER_PERSONALITY,
  MAX_COPIES_PER_ASPECT,
  MAX_LEGENDARY_COPIES,
  MAX_SERIES,
  type CardForDeckValidation,
} from '../deck';

function card(
  id: string,
  opts: Partial<CardForDeckValidation> = {},
): CardForDeckValidation {
  return {
    id,
    personalityTag: opts.personalityTag ?? `p_${id}`,
    rarity: opts.rarity ?? 'common',
    isToken: opts.isToken,
    series: opts.series ?? ['test'],
  };
}

function filler(count: number, series = 'test'): CardForDeckValidation[] {
  return Array.from({ length: count }, (_, i) =>
    card(`filler_${i}`, { series: [series] }),
  );
}

describe('validateDeck', () => {
  it('принимает корректную колоду', () => {
    const pool = filler(DECK_SIZE);
    const ids = pool.map((c) => c.id);
    const r = validateDeck(ids, pool);
    expect(r.valid).toBe(true);
  });

  it('ругается на неверный размер', () => {
    const pool = filler(29);
    const r = validateDeck(pool.map((c) => c.id), pool);
    expect(r.valid).toBe(false);
    expect(r.errors.find((e) => e.kind === 'WRONG_SIZE')).toBeDefined();
  });

  it('ругается на неизвестную карту', () => {
    const pool = filler(DECK_SIZE);
    const ids = [...pool.map((c) => c.id), 'unknown_1'];
    ids.shift();
    const r = validateDeck(ids, pool);
    expect(r.errors.find((e) => e.kind === 'UNKNOWN_CARD')).toBeDefined();
  });

  it('ругается на токен в колоде', () => {
    const pool = filler(DECK_SIZE - 1);
    const token = card('tk_1', { isToken: true });
    const ids = [...pool.map((c) => c.id), token.id];
    const r = validateDeck(ids, [...pool, token]);
    expect(r.errors.find((e) => e.kind === 'TOKEN_IN_DECK')).toBeDefined();
  });

  it('не более 2 копий одного аспекта', () => {
    const sp = card('sw_spearman');
    const rest = filler(DECK_SIZE - 3);
    const ids = [sp.id, sp.id, sp.id, ...rest.map((c) => c.id)];
    const r = validateDeck(ids, [sp, ...rest]);
    const err = r.errors.find((e) => e.kind === 'TOO_MANY_ASPECT_COPIES');
    expect(err).toBeDefined();
    if (err && err.kind === 'TOO_MANY_ASPECT_COPIES') {
      expect(err.count).toBe(3);
      expect(err.max).toBe(MAX_COPIES_PER_ASPECT);
    }
  });

  it('не более 5 копий одной личности', () => {
    const family = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'].map((id) =>
      card(id, { personalityTag: 'temporal' }),
    );
    const rest = filler(DECK_SIZE - 6);
    const ids = [...family.map((c) => c.id), ...rest.map((c) => c.id)];
    const r = validateDeck(ids, [...family, ...rest]);
    const err = r.errors.find((e) => e.kind === 'TOO_MANY_COPIES');
    expect(err).toBeDefined();
    if (err && err.kind === 'TOO_MANY_COPIES') {
      expect(err.personalityTag).toBe('temporal');
      expect(err.count).toBe(6);
      expect(err.max).toBe(MAX_COPIES_PER_PERSONALITY);
    }
  });

  it('не более 1 копии легендарки', () => {
    const leg = card('lg_roland', { rarity: 'legendary' });
    const rest = filler(DECK_SIZE - 2);
    const ids = [leg.id, leg.id, ...rest.map((c) => c.id)];
    const r = validateDeck(ids, [leg, ...rest]);
    const err = r.errors.find((e) => e.kind === 'TOO_MANY_LEGENDARIES');
    expect(err).toBeDefined();
    if (err && err.kind === 'TOO_MANY_LEGENDARIES') {
      expect(err.count).toBe(2);
      expect(err.max).toBe(MAX_LEGENDARY_COPIES);
    }
  });

  it('не более 4 серий в колоде', () => {
    const a = card('a', { series: ['s1'] });
    const b = card('b', { series: ['s2'] });
    const c = card('c', { series: ['s3'] });
    const d = card('d', { series: ['s4'] });
    const e = card('e', { series: ['s5'] });
    const rest = Array.from({ length: DECK_SIZE - 5 }, (_, i) =>
      card(`filler_${i}`, { series: [] }),
    );
    const ids = [a, b, c, d, e].map((x) => x.id).concat(rest.map((x) => x.id));
    const r = validateDeck(ids, [a, b, c, d, e, ...rest]);
    const err = r.errors.find((x) => x.kind === 'TOO_MANY_SERIES');
    expect(err).toBeDefined();
    if (err && err.kind === 'TOO_MANY_SERIES') {
      expect(err.count).toBe(5);
      expect(err.max).toBe(MAX_SERIES);
    }
  });

  it('карта с несколькими сериями учитывается во всех', () => {
    const multi = card('multi', { series: ['s1', 's2'] });
    const extra = [
      card('x', { series: ['s3'] }),
      card('y', { series: ['s4'] }),
      card('z', { series: ['s5'] }),
    ];
    const rest = Array.from({ length: DECK_SIZE - 4 }, (_, i) =>
      card(`filler_${i}`, { series:  [] }),
    );
    const ids = [multi, ...extra].map((c) => c.id).concat(rest.map((c) => c.id));
    const r = validateDeck(ids, [multi, ...extra, ...rest]);
    const err = r.errors.find((e) => e.kind === 'TOO_MANY_SERIES');
    expect(err).toBeDefined();
    if (err && err.kind === 'TOO_MANY_SERIES') {
      expect(err.count).toBe(5);
      expect(new Set(err.series).size).toBe(5);
    }
  });

  it('карты без series не учитываются в бюджет серий', () => {
    const legacy = card('legacy', { series: undefined });
    const rest = filler(DECK_SIZE - 1);
    const ids = [legacy, ...rest].map((c) => c.id);
    const r = validateDeck(ids, [legacy, ...rest]);
    expect(r.errors.find((e) => e.kind === 'TOO_MANY_SERIES')).toBeUndefined();
  });

  it('карта без series не ломает валидацию', () => {
    const legacy = card('legacy', { series: undefined });
    const rest = filler(DECK_SIZE - 1);
    const ids = [legacy, ...rest].map((c) => c.id);
    const r = validateDeck(ids, [legacy, ...rest]);
    expect(r.valid).toBe(true);
  });
});