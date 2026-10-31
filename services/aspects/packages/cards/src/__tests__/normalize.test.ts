import { describe, it, expect } from 'vitest';
import {
  getCards,
  hasSeries,
  hasFaction,
  hasRole,
  getPrimarySeries,
} from '../loader';
import { KEYWORD_INFO } from '../abilities';

describe('normalizeCard (через getCards)', () => {
  const cards = getCards('ash_stormwind');
  const byId = Object.fromEntries(cards.map((c) => [c.id, c]));

  it('проставляет series из packId, если не задано', () => {
    const c = byId['sw_spearman'];
    expect(c.series).toEqual(['ash_stormwind']);
  });

  it('извлекает factions из tags', () => {
    const c = byId['sw_spearman'];
    expect(c.factions).toContain('ash_stormwind');
  });

  it('извлекает roles из tags, исключая factions и series', () => {
    const c = byId['sw_spearman'];
    expect((c.roles ?? []).length).toBeGreaterThan(0);
    for (const r of c.roles ?? []) {
      expect(r).not.toContain('stormwind');
      expect(r).not.toContain('ashenlight');
    }
  });

  it('не переопределяет явно заданные series', () => {
    const custom = {
      ...byId['sw_spearman'],
      id: 'test_custom',
      series: ['novogodnyaya'],
    };
    expect(custom.series).toEqual(['novogodnyaya']);
  });

  it('abilityInfo заполняется дефолтом для всех ключевых слов', () => {
    const withKnownKw = cards.find((c) =>
      (c.abilities ?? []).some((kw) => KEYWORD_INFO[kw as keyof typeof KEYWORD_INFO]),
    )!;
    expect(withKnownKw).toBeDefined();
    for (const kw of withKnownKw.abilities ?? []) {
      const info = KEYWORD_INFO[kw as keyof typeof KEYWORD_INFO];
      if (!info) continue;
      expect(withKnownKw.abilityInfo?.[kw]?.name, `name для ${kw}`).toBeTruthy();
      expect(withKnownKw.abilityInfo?.[kw]?.description).toBeTruthy();
    }
  });

  it('hasSeries работает', () => {
    expect(hasSeries(byId['sw_spearman'], 'ash_stormwind')).toBe(true);
    expect(hasSeries(byId['sw_spearman'], 'unknown')).toBe(false);
  });

  it('hasFaction работает', () => {
    expect(hasFaction(byId['sw_spearman'], 'ash_stormwind')).toBe(true);
    expect(hasFaction(byId['sw_spearman'], 'enterprise')).toBe(false);
  });

  it('hasRole работает', () => {
    const c = byId['sw_spearman'];
    const someRole = (c.roles ?? [])[0];
    expect(someRole).toBeDefined();
    expect(hasRole(c, someRole!)).toBe(true);
    expect(hasRole(c, '___definitely_not_a_role___')).toBe(false);
  });

  it('getPrimarySeries возвращает первую серию', () => {
    expect(getPrimarySeries(byId['sw_spearman'])).toBe('ash_stormwind');
  });
});

describe('KEYWORD_INFO', () => {
  it('все ключевые слова имеют имя и описание', () => {
    for (const [id, info] of Object.entries(KEYWORD_INFO)) {
      expect(info.name, `name для ${id}`).toBeTruthy();
      expect(info.description, `description для ${id}`).toBeTruthy();
    }
  });
});
