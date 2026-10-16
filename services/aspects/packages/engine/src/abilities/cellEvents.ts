import type { WritableDraft } from 'immer';
import type { GameState } from '../types/state';
import type { CardInstanceId, PlayerId, ColumnIndex } from '../types/ids';
import { enqueueTrigger } from '../state/triggerEnqueue';

/**
 * Когда игрок захватывает нейтрал — все его карты во Фронте
 * получают шанс среагировать через ON_CELL_CAPTURED.
 */
export function notifyCellCaptured(
  draft: WritableDraft<GameState>,
  _column: ColumnIndex,
  playerId: PlayerId,
): void {
  const ids: CardInstanceId[] = [];
  for (const col of draft.board) {
    const id = playerId === 'p1' ? col.p1Front : col.p2Front;
    if (id) ids.push(id);
  }
  for (const id of ids) {
    enqueueTrigger(draft, id, 'ON_CELL_CAPTURED');
  }
}

/**
 * Когда игрок теряет нейтрал — все его карты во Фронте получают
 * шанс среагировать через ON_CELL_LOST.
 */
export function notifyCellLost(
  draft: WritableDraft<GameState>,
  _column: ColumnIndex,
  playerId: PlayerId,
): void {
  const ids: CardInstanceId[] = [];
  for (const col of draft.board) {
    const id = playerId === 'p1' ? col.p1Front : col.p2Front;
    if (id) ids.push(id);
  }
  for (const id of ids) {
    enqueueTrigger(draft, id, 'ON_CELL_LOST');
  }
}