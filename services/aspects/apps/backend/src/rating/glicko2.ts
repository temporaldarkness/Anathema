/**
 * Glicko-2 (Mark Glickman, 2000). Один матч 1v1.
 * Шкала: rating = 1500 ± RD, где RD = 350 у нового игрока.
 * Константа tau = 0.5 (рекомендация автора), epsilon = 1e-6.
 */

const SCALE = 173.7178; // 400 / ln(10)
const DEFAULT_RATING = 1500;
const DEFAULT_RD = 350;
const DEFAULT_VOLATILITY = 0.06;
const TAU = 0.5;
const EPSILON = 0.000001;

export interface Rating {
  rating: number;
  rd: number;
  volatility: number;
}

export const RATING_DEFAULTS: Rating = {
  rating: DEFAULT_RATING,
  rd: DEFAULT_RD,
  volatility: DEFAULT_VOLATILITY,
};

interface Internal {
  mu: number;
  phi: number;
  sigma: number;
}

function toInternal(r: Rating): Internal {
  return {
    mu: (r.rating - DEFAULT_RATING) / SCALE,
    phi: r.rd / SCALE,
    sigma: r.volatility,
  };
}

function fromInternal(i: Internal): Rating {
  return {
    rating: i.mu * SCALE + DEFAULT_RATING,
    rd: i.phi * SCALE,
    volatility: i.sigma,
  };
}

function g(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

function expectedScore(mu: number, muOpp: number, phiOpp: number): number {
  return 1 / (1 + Math.exp(-g(phiOpp) * (mu - muOpp)));
}

/**
 * Обновляет рейтинг одного игрока после одного матча.
 * score: 1 (win), 0 (loss), 0.5 (draw).
 */
export function updateOne(
  player: Rating,
  opponent: Rating,
  score: 0 | 0.5 | 1,
): Rating {
  const p = toInternal(player);
  const o = toInternal(opponent);

  const gPhi = g(o.phi);
  const e = expectedScore(p.mu, o.mu, o.phi);

  // Estimated variance
  const v = 1 / (gPhi * gPhi * e * (1 - e));

  // Improvement direction
  const delta = v * gPhi * (score - e);

  // New volatility via iterative algorithm (Illinois algorithm variant)
  const newSigma = solveVolatility(p.sigma, p.phi, v, delta);

  // Pre-rating period
  const phiStar = Math.sqrt(p.phi * p.phi + newSigma * newSigma);

  // New RD and rating
  const newPhi = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const newMu = p.mu + newPhi * newPhi * gPhi * (score - e);

  return fromInternal({ mu: newMu, phi: newPhi, sigma: newSigma });
}

function solveVolatility(
  sigma: number,
  phi: number,
  v: number,
  delta: number,
): number {
  const a = Math.log(sigma * sigma);
  const phiSq = phi * phi;
  const deltaSq = delta * delta;

  const f = (x: number): number => {
    const ex = Math.exp(x);
    const num = ex * (deltaSq - phiSq - v - ex);
    const den = 2 * Math.pow(phiSq + v + ex, 2);
    return num / den - (x - a) / (TAU * TAU);
  };

  let A: number;
  let B: number;

  if (deltaSq > phiSq + v) {
    B = Math.log(deltaSq - phiSq - v);
  } else {
    let k = 1;
    while (f(a - k * TAU) < 0 && k < 100) {
      k++;
    }
    B = a - k * TAU;
  }

  A = a;
  let fA = f(A);
  let fB = f(B);

  // Illinois algorithm
  while (Math.abs(B - A) > EPSILON) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA = fA / 2;
    }
    B = C;
    fB = fC;
  }

  return Math.exp(A / 2);
}

/**
 * Парный матч: обновляет обоих игроков.
 */
export function updatePair(
  player1: Rating,
  player2: Rating,
  outcome: 'p1_win' | 'p2_win' | 'draw',
): { p1: Rating; p2: Rating } {
  const score1: 0 | 0.5 | 1 =
    outcome === 'p1_win' ? 1 : outcome === 'p2_win' ? 0 : 0.5;
  const score2: 0 | 0.5 | 1 = (1 - score1) as 0 | 0.5 | 1;

  return {
    p1: updateOne(player1, player2, score1),
    p2: updateOne(player2, player1, score2),
  };
}

/** Круглая оценка для отображения. */
export function roundRating(value: number): number {
  return Math.round(value);
}

/** Дельта округлённая — для показа «+12 / −12» после матча. */
export function ratingDelta(before: number, after: number): string {
  const d = Math.round(after - before);
  return d >= 0 ? `+${d}` : `${d}`;
}