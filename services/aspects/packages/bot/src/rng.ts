/**
 * Детерминированный PRNG для бота.
 *
 * Запрет на Math.random() — критичен для воспроизводимости симуляций.
 * Инициализируется от seed-строки (обычно state.rngState + salt).
 *
 * Алгоритм: xorshift32. Быстрый, без ветвлений, даёт равномерное
 * распределение в [0, 1). Не криптостойкий — нам это не нужно.
 */

function hashSeed(s: string): number {
  // FNV-1a 32-bit.
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h || 1; // не допускаем 0 — для xorshift это тупиковое состояние
}

export interface Rng {
  next(): number;
  /** Целое в [0, n). */
  int(n: number): number;
}

export function makeRng(seed: string): Rng {
  let state = hashSeed(seed);
  return {
    next(): number {
      state ^= state << 13; state >>>= 0;
      state ^= state >>> 17;
      state ^= state << 5;  state >>>= 0;
      return state / 0x100000000;
    },
    int(n: number): number {
      return Math.floor(this.next() * n);
    },
  };
}