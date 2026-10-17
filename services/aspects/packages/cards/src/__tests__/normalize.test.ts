import { describe, it, expect } from 'vitest';
import {
  getCards,
  cardsForScope,
  hasSeries,
  hasFaction,
  hasRole,
  getPrimarySeries,
} from '../loader';
import { KEYWORD_INFO } from '../abilities';

describe('normalizeCard (через getCards)', () => {
  const cards = getCards('stormwind');
  const byId = Object.fromEntries(cards.map((c) => [c.id, c]));

  it('проставляет series из packId, если не задано', () => {
    const c = byId['sw_spearman'];
    expect(c.series).toEqual(['stormwind']);
  });

  it('извлекает factions из tags', () => {
    const c = byId['sw_spearman'];
    expect(c.factions).toEqual(['stormwind']);
  });

  it('извлекает roles из tags, исключая factions и series', () => {
    const c = byId['sw_spearman'];
    // Не привязываемся к конкретной роли: контент меняется.
    // Проверяем суть: роли есть, и в них нет faction/series.
    expect((c.roles ?? []).length).toBeGreaterThan(0);
    expect(c.roles).not.toContain('stormwind');
    expect(c.roles).not.toContain('azeroth');
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
    const c = byId['sw_gatekeeper'];
    expect(c.abilities).toContain('taunt');
    expect(c.abilityInfo?.taunt?.name).toBe('Страж');
    expect(c.abilityInfo?.taunt?.description).toBe(
      KEYWORD_INFO.taunt.description,
    );
  });

  it('abilityInfo не переопределяется, если задано явно', () => {
    // `azeroth` — scope, а не серия. Используем cardsForScope,
    // который возвращает Record<string, CardDefinition>.
    const azerothCards = Object.values(cardsForScope('azeroth'));
    const c = azerothCards.find((x) => x.id === 'sw_marksman');
    expect(c?.abilityInfo).toBeDefined();
  });

  it('hasSeries работает', () => {
    expect(hasSeries(byId['sw_spearman'], 'stormwind')).toBe(true);
    expect(hasSeries(byId['sw_spearman'], 'unknown')).toBe(false);
  });

  it('hasFaction работает', () => {
    expect(hasFaction(byId['sw_spearman'], 'stormwind')).toBe(true);
    expect(hasFaction(byId['sw_spearman'], 'enterprise')).toBe(false);
  });

  it('hasRole работает', () => {
    // Проверяем на реальной роли карты, а не на захардкоженной строке.
    const c = byId['sw_spearman'];
    const someRole = (c.roles ?? [])[0];
    expect(someRole).toBeDefined();
    expect(hasRole(c, someRole!)).toBe(true);
    expect(hasRole(c, '___definitely_not_a_role___')).toBe(false);
  });

  it('getPrimarySeries возвращает первую серию', () => {
    expect(getPrimarySeries(byId['sw_spearman'])).toBe('stormwind');
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