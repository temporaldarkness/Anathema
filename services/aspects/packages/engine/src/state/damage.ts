import type { WritableDraft } from 'immer';
import type { GameState, CardInstance } from '../types/state';
import type { ResolutionContext } from '../types/resolution';
import type { CardInstanceId } from '../types/ids';
import { columnBonuses, health, cardAbilities } from './helpers';
import { enqueueTrigger } from './triggerEnqueue';

export interface DamageResult {
  absorbed: boolean;
  dealt: number;
  overflow: number;
  killed: boolean;
}

export function damageCard(
  draft: WritableDraft<GameState>,
  targetId: CardInstanceId,
  amount: number,
  source: string,
  ctx: ResolutionContext,
): DamageResult {
  const target = draft.cards[targetId];
  if (!target) {
    return { absorbed: false, dealt: 0, overflow: 0, killed: false };
  }

  if (target.shieldAvailable) {
    target.shieldAvailable = false;
    ctx.events.push({ type: 'SHIELD_ABSORBED', cardId: targetId });
    return { absorbed: true, dealt: 0, overflow: 0, killed: false };
  }

  const defOwner = target.ownerId;
  const defBonuses = columnBonuses(draft as GameState, defOwner);

  const abilities = cardAbilities(draft as GameState, targetId);
  const hasArmor = abilities.includes('armored');
  const armorReduction = hasArmor ? 1 : 0;

  const totalReduction = defBonuses.damageReduction + armorReduction;
  const actual = Math.max(0, amount - totalReduction);

  if (actual < amount) {
    ctx.events.push({
      type: 'DAMAGE_ABSORBED',
      targetId,
      absorbed: amount - actual,
      reason: armorReduction > 0 ? 'armor' : 'defense',
    });
  }

  if (actual === 0) {
    return { absorbed: false, dealt: 0, overflow: 0, killed: false };
  }

  target.damageTaken += actual;
  const afterHp = health(target as CardInstance);
  ctx.events.push({ type: 'DAMAGE_DEALT', targetId, amount: actual, source });

  if (target.zone === 'FRONT') {
    enqueueTrigger(draft, targetId, 'ON_THIS_DAMAGED');
  }

  // ON_DAMAGE_DEALT — энкьюим на всех союзников-фронт источника
  // (карт, которые наносят урон) — по аналогии с ON_CARD_DRAWN.
  // Источник может быть «ability:<cardId>» или plain cardId.
  if (source && !source.startsWith('ability:')) {
    const sourceId = source as CardInstanceId;
    const srcCard = draft.cards[sourceId];
    if (srcCard && (srcCard.zone === 'FRONT' || srcCard.zone === 'RESERVE')) {
      enqueueTrigger(draft, sourceId, 'ON_DAMAGE_DEALT');
    }
  }

  if (afterHp <= 0) {
    return { absorbed: false, dealt: actual, overflow: -afterHp, killed: true };
  }
  return { absorbed: false, dealt: actual, overflow: 0, killed: false };
}