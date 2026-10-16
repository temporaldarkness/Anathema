import type { WritableDraft } from 'immer';
import type { GameState, Modifier } from '../types/state';
import { CardInstanceId } from '../types/ids';
import { cardAbilities } from './helpers';

const SUPPRESS_SOURCE_PREFIX = 'suppress:';

export function recomputeSuppression(draft: WritableDraft<GameState>): void {
  for (const id of Object.keys(draft.cards) as CardInstanceId[]) {
    const card = draft.cards[id];
    card.modifiers = card.modifiers.filter(
      (m: Modifier) => !m.source.startsWith(SUPPRESS_SOURCE_PREFIX),
    );
  }

  for (let i = 0; i < 5; i++) {
    const col = draft.board[i];
    const p1F = col.p1Front;
    const p2F = col.p2Front;
    if (!p1F || !p2F) continue;

    const p1Card = draft.cards[p1F];
    const p2Card = draft.cards[p2F];

    if (cardAbilities(draft as GameState, p1F).includes('suppress')) {
      p2Card.modifiers.push({
        source: `${SUPPRESS_SOURCE_PREFIX}${p1F}`,
        stat: 'strength',
        delta: -1,
      });
      p2Card.modifiers.push({
        source: `${SUPPRESS_SOURCE_PREFIX}${p1F}`,
        stat: 'health',
        delta: -1,
      });
    }
    if (cardAbilities(draft as GameState, p2F).includes('suppress')) {
      p1Card.modifiers.push({
        source: `${SUPPRESS_SOURCE_PREFIX}${p2F}`,
        stat: 'strength',
        delta: -1,
      });
      p1Card.modifiers.push({
        source: `${SUPPRESS_SOURCE_PREFIX}${p2F}`,
        stat: 'health',
        delta: -1,
      });
    }
  }
}

export function checkSuppressionDeaths(draft: WritableDraft<GameState>): string[] {
  const dead: string[] = [];
  for (const id of Object.keys(draft.cards) as CardInstanceId[]) {
    const card = draft.cards[id];
    if (card.zone !== 'FRONT') continue;
    let hp = card.baseHealth - card.damageTaken;
    for (const m of card.modifiers) if (m.stat === 'health') hp += m.delta;
    if (hp <= 0) dead.push(id);
  }
  return dead;
}