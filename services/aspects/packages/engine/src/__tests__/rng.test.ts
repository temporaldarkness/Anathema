import { describe, it, expect } from 'vitest';
import { mulberry32Next, hashSeed } from '../rng/mulberry';

describe('mulberry32Next', () => {
  it('детерминирован: одинаковое состояние → одинаковый результат', () => {
    const seed = hashSeed('rng-test');
    const a = mulberry32Next(seed);
    const b = mulberry32Next(seed);
    expect(a.next).toBe(b.next);
    expect(a.value).toBe(b.value);
  });

  it('прогрессия не зацикливается: разные состояния → разные значения', () => {
    const seed = hashSeed('rng-test');
    const seen = new Set<number>();
    let state = seed;
    for (let i = 0; i < 100; i++) {
      const { next, value } = mulberry32Next(state);
      seen.add(value);
      state = next;
    }
    expect(seen.size).toBeGreaterThan(95);
  });

  it('значения в [0, 1)', () => {
    let state = hashSeed('bounds');
    for (let i = 0; i < 200; i++) {
      const { next, value } = mulberry32Next(state);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      state = next;
    }
  });
});