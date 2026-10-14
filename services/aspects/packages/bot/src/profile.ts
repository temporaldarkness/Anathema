import { makeRng } from './rng';

// ─────────────────────────── Профили поведения ───────────────────────

/**
 * Стиль игры. Все оси в диапазоне 0..1.
 * 0.5 = «баланс по умолчанию», 0 = минимум оси, 1 = максимум.
 *
 * Оси модулируют существующие оценочные функции, не заменяют их.
 * Например, aggression меняет вес карточных kills и щедрость на
 * лицо; defensiveness усиливает штрафы за невыгодные размены.
 */
export interface BehaviorProfile {
  readonly name: string;
  /** 0 = торговать, 1 = идти в лицо. */
  readonly aggression: number;
  /** 0 = игнор нейтралов, 1 = гонка за 5. */
  readonly neutralPriority: number;
  /** 0 = не бить гильдию без летального, 1 = бить при любой возможности. */
  readonly facePressure: number;
  /** 0 = безрассудно, 1 = осторожно, защита своих. */
  readonly defensiveness: number;
  /** 0 = дешёвый темп, 1 = копить и разыгрывать дорогое. */
  readonly greediness: number;
  /** 0 = никогда не заменять, 1 = всегда менять при возможности. */
  readonly replacementLove: number;
}

export const PROFILES: Record<string, BehaviorProfile> = {
  balanced: {
    name: 'balanced',
    aggression: 0.5, neutralPriority: 0.5, facePressure: 0.5,
    defensiveness: 0.5, greediness: 0.5, replacementLove: 0.5,
  },
  aggro: {
    name: 'aggro',
    aggression: 0.9, neutralPriority: 0.2, facePressure: 0.9,
    defensiveness: 0.1, greediness: 0.2, replacementLove: 0.3,
  },
  defensive: {
    name: 'defensive',
    aggression: 0.2, neutralPriority: 0.5, facePressure: 0.2,
    defensiveness: 0.9, greediness: 0.6, replacementLove: 0.8,
  },
  control: {
    name: 'control',
    aggression: 0.1, neutralPriority: 0.8, facePressure: 0.1,
    defensiveness: 0.8, greediness: 0.9, replacementLove: 0.6,
  },
  opportunist: {
    name: 'opportunist',
    aggression: 0.6, neutralPriority: 0.9, facePressure: 0.4,
    defensiveness: 0.4, greediness: 0.5, replacementLove: 0.5,
  },
  berserker: {
    name: 'berserker',
    aggression: 1.0, neutralPriority: 0.1, facePressure: 1.0,
    defensiveness: 0.0, greediness: 0.1, replacementLove: 0.2,
  },
};

export type ProfileName = keyof typeof PROFILES;

// ─────────────────────────── Уровни сложности ────────────────────────

/**
 * Сложность = температура софтмакса + вероятность «тупой ошибки».
 *
 * temperature: 0 = чистый argmax, 1 = сильно размытый выбор.
 * mistakeRate: с этой вероятностью выбираем случайное из всех валидных.
 *
 * Профиль по умолчанию применяется, если в имени бота он не задан.
 */
export interface DifficultyLevel {
  readonly name: string;
  readonly temperature: number;
  readonly mistakeRate: number;
  readonly mistakeWidth: number;
  readonly defaultProfile: ProfileName;
}

export const LEVELS: Record<string, DifficultyLevel> = {
  rookie: {
    name: 'rookie',
    temperature: 0.10,
    mistakeRate: 0.80,
    mistakeWidth: 12,
    defaultProfile: 'opportunist',
  },
  novice: {
    name: 'novice',
    temperature: 0.05,
    mistakeRate: 0.55,
    mistakeWidth: 10,
    defaultProfile: 'opportunist',
  },
  regular: {
    name: 'regular',
    temperature: 0.03,
    mistakeRate: 0.25,
    mistakeWidth: 6,
    defaultProfile: 'balanced',
  },
  veteran: {
    name: 'veteran',
    temperature: 0.01,
    mistakeRate: 0.10,
    mistakeWidth: 3,
    defaultProfile: 'balanced',
  },
  master: {
    name: 'master',
    temperature: 0.005,
    mistakeRate: 0.02,
    mistakeWidth: 2,
    defaultProfile: 'balanced',
  },
  grandmaster: {
    name: 'grandmaster',
    temperature: 0,
    mistakeRate: 0,
    mistakeWidth: 1,
    defaultProfile: 'balanced',
  },
};

export type LevelName = keyof typeof LEVELS;

// ─────────────────────────── Softmax-выбор ───────────────────────────

export interface ScoredOption<T> {
  readonly value: T;
  readonly score: number;
}

/**
 * Выбирает один из прошедших scoring вариантов.
 *
 * Алгоритм:
 *  1. Если mistakeRate > 0 и RNG попал в него — случайный из всех.
 *  2. Если temperature ≤ 0.001 — детерминированный argmax.
 *  3. Иначе — softmax с масштабом temperature × 500.
 *
 * Детерминизм гарантирован seed'ом: (seed, salt) → фиксированный выбор.
 * Для разных мест вызова используем разный salt, чтобы решения не
 * коррелировали.
 */
export function selectOption<T>(
  options: readonly ScoredOption<T>[],
  opts: {
    temperature: number;
    mistakeRate: number;
	mistakeWidth: number;
    seed: string;
    salt: string;
  },
): T | null {
  if (options.length === 0) return null;
  if (options.length === 1) return options[0].value;

  const rng = makeRng(`${opts.seed}|${opts.salt}`);

  // Шаг 1: mistake.
  if (opts.mistakeRate > 0 && rng.next() < opts.mistakeRate) {
    const sorted = [...options].sort((a, b) => b.score - a.score);
	const k = Math.min(opts.mistakeWidth, sorted.length);
    return sorted[rng.int(k)].value;
  }

  // Шаг 2: детерминированный argmax.
  if (opts.temperature <= 0.001) {
    let best = options[0];
    for (const o of options) {
      if (o.score > best.score) best = o;
    }
    return best.value;
  }

  // Шаг 3: softmax.
  let maxScore = -Infinity;
  for (const o of options) if (o.score > maxScore) maxScore = o.score;

  const scale = Math.max(1, opts.temperature * 500);
  let total = 0;
  const weights: number[] = [];
  for (const o of options) {
    const w = Math.exp((o.score - maxScore) / scale);
    weights.push(w);
    total += w;
  }

  let roll = rng.next() * total;
  for (let i = 0; i < options.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return options[i].value;
  }
  return options[options.length - 1].value;
}

// ─────────────────────────── Парсинг имён ────────────────────────────

const PROFILE_NAMES: readonly string[] = Object.keys(PROFILES);
const LEVEL_NAMES: readonly string[] = Object.keys(LEVELS);
export interface ParsedBotName {
  readonly base: 'v4' | 'v5';
  readonly profileName: ProfileName;
  readonly levelName: LevelName;
}

/**
 * Парсит имена вида:
 *   heuristic-v4
 *   heuristic-v4-aggro
 *   heuristic-v4-veteran
 *   heuristic-v4-aggro-veteran
 *
 * Никаких суффиксов типа postfix — это лишнее. Отличие v4 от v5
 * задаётся в bot-factory: v5 = lateGameNeutralFix=true.
 *
 * Возвращает null, если имя не подходит под паттерн.
 */
export function parseHeuristicName(name: string): ParsedBotName | null {
  const parts = name.split('-');
  if (parts.length < 2) return null;
  if (parts[0] !== 'heuristic') return null;
  if (parts[1] !== 'v4' && parts[1] !== 'v5') return null;

  const base = parts[1] as 'v4' | 'v5';
  let profileName: ProfileName | undefined;
  let levelName: LevelName | undefined;

  for (const p of parts.slice(2)) {
    if (PROFILE_NAMES.includes(p)) {
      profileName = p as ProfileName;
    } else if (LEVEL_NAMES.includes(p)) {
      levelName = p as LevelName;
    } else {
      return null;
    }
  }

  const resolvedLevel: LevelName = levelName ?? 'master';
  const resolvedProfile: ProfileName =
    profileName ?? LEVELS[resolvedLevel].defaultProfile;

  return {
    base,
    profileName: resolvedProfile,
    levelName: resolvedLevel,
  };
}