import type { WritableDraft } from 'immer';
import type { GameState, CardInstance } from '../types/state';
import type { ResolutionContext } from '../types/resolution';
import type { CardInstanceId } from '../types/ids';
import { columnBonuses, health } from './helpers';
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

  // Щит поглощает урон целиком — раньше брони и защиты колонки.
  if (target.shieldAvailable) {
    target.shieldAvailable = false;
    ctx.events.push({ type: 'SHIELD_ABSORBED', cardId: targetId });
    return { absorbed: true, dealt: 0, overflow: 0, killed: false };
  }

  const defOwner = target.ownerId;
  const defBonuses = columnBonuses(draft as GameState, defOwner);

  // Броня — intrinsic keyword, работает во всех зонах.
  const targetDef = draft.definitions[target.definitionId];
  const hasArmor = (targetDef?.abilities ?? []).includes('armored');
  const armorReduction = hasArmor ? 1 : 0;

  const totalReduction = defBonuses.damageReduction + armorReduction;
  const actual = Math.max(0, amount - totalReduction);

  if (actual < amount) {
    ctx.events.push({
      type: 'DAMAGE_ABSORBED',
      targetId,
      absorbed: amount - actual,
      // Приоритет в reason: если сработала броня — показываем 'armor',
      // иначе защиту колонки.
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

  if (afterHp <= 0) {
    return { absorbed: false, dealt: actual, overflow: -afterHp, killed: true };
  }
  return { absorbed: false, dealt: actual, overflow: 0, killed: false };
}