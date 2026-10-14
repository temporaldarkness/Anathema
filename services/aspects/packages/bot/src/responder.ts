import type { GameState, PlayerId } from '@aspects/engine';

/**
 * Кто должен действовать в текущем состоянии?
 *
 * - Если есть pendingChoice — тот, кому адресован выбор.
 * - Если фаза MULLIGAN — тот, кто ещё не сделал выбор (сначала p1,
 *   потом p2). Если оба сделали — null (фаза должна была завершиться,
 *   но если нет — мы не зацикливаемся).
 * - Иначе — активный игрок.
 */
export function pickResponder(state: GameState): PlayerId | null {
  if (state.pendingChoice) {
    return state.pendingChoice.playerId;
  }
  if (state.phase === 'MULLIGAN') {
    if (!state.mulliganDone['p1']) return 'p1';
    if (!state.mulliganDone['p2']) return 'p2';
    return null;
  }
  return state.activePlayer;
}