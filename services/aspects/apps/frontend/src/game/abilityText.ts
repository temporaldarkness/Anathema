import { KEYWORD_INFO, type CardDefinition } from '@aspects/cards';

// ─── Плюрализация ───

/**
 * Русская плюрализация. Примеры:
 *   plural(1, 'карта', 'карты', 'карт')  → 'карта'
 *   plural(3, 'карта', 'карты', 'карт')  → 'карты'
 *   plural(7, 'карта', 'карты', 'карт')  → 'карт'
 *   plural(21, 'карта', 'карты', 'карт') → 'карта'
 */
function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n);
  const lastTwo = abs % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return many;
  const last = abs % 10;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

// ─── Ключевые слова ───

export const KEYWORD_ICON: Record<string, string> = {
  charge: '⚡',
  slow: '⏳',
  vanguard: '🚀',
  taunt: '🛡',
  scout: '🔍',
  breakthrough: '💥',
  shield: '🛡',
  suppress: '⬇',
  temporary: '⏱',
};

/**
 * Короткий текст для тултипа/списка (с именем и кратким описанием).
 * Для `temporary` подставляет реальное число ходов из карты.
 */
export function resolveKeyword(
  card: CardDefinition | null,
  kw: string,
): { name: string; description: string } {
  if (kw === 'temporary') {
    const n = card?.tempDuration ?? 1;
    return {
      name: 'Временная',
      description: `Исчезнет через ${n} ${plural(n, 'ход', 'хода', 'ходов')}.`,
    };
  }
  const shared = (KEYWORD_INFO as Record<string, { name: string; description: string }>)[kw];
  if (shared) return shared;
  return { name: kw, description: '' };
}

/** Готовая строка "Имя: описание" для компактного тултипа. */
export function resolveKeywordText(
  card: CardDefinition | null,
  kw: string,
): string {
  const { name, description } = resolveKeyword(card, kw);
  return description ? `${name}: ${description}` : name;
}

// ─── Редкость ───

export const RARITY_TEXT: Record<string, string> = {
  common: 'Обычная',
  uncommon: 'Необычная',
  rare: 'Редкая',
  epic: 'Эпическая',
  legendary: 'Легендарная',
};

export const RARITY_COLOR: Record<string, string> = {
  common: '#6b7280',
  uncommon: '#22c55e',
  rare: '#3b82f6',
  epic: '#a855f7',
  legendary: '#f59e0b',
};

// ─── Триггеры ───

export const TRIGGER_ICON: Record<string, string> = {
  ON_ENTER: '🚪',
  ON_EXIT: '💨',
  ON_REINFORCE: '⬆️',
  ON_REPLACE: '🔄',
  ON_TURN_START: '🌅',
  ON_TURN_END: '🌙',
  ON_THIS_DAMAGED: '🩸',
  ON_ALLY_ATTACKED: '🛡️',
  ON_ENEMY_ATTACK: '⚔️',
  ON_ALLY_DIED: '⚰️',
};

export function triggerText(trigger: string): string {
  const map: Record<string, string> = {
    ON_ENTER: 'При входе на поле',
    ON_EXIT: 'При уходе с поля',
    ON_REINFORCE: 'При переходе из Резерва во Фронт',
    ON_REPLACE: 'Когда эта карта заменяет другую',
    ON_TURN_START: 'В начале своего хода',
    ON_TURN_END: 'В конце своего хода',
    ON_THIS_DAMAGED: 'Когда эта карта получает урон',
    ON_ALLY_ATTACKED: 'Когда союзника атакуют',
    ON_ENEMY_ATTACK: 'Когда противник атакует',
    ON_ALLY_DIED: 'Когда союзник погибает',
  };
  return map[trigger] ?? trigger;
}

// ─── Селекторы ───

function targetText(target: string): string {
  const map: Record<string, string> = {
    SELF: 'себе',
    OWNER_HERO: 'своей гильдии',
    ENEMY_HERO: 'гильдии противника',
    ALL_FRIENDLY_FRONT: 'всем союзникам во Фронте',
    ALL_ENEMY_FRONT: 'всем врагам во Фронте',
    ALL_FRIENDLY_BOARD: 'всем союзникам',
    ALL_ENEMY_BOARD: 'всем врагам',
    ALL_CARDS_ON_BOARD: '⚠ всем картам на доске',
    RANDOM_ENEMY_FRONT: 'случайному врагу во Фронте',
    RANDOM_FRIENDLY_FRONT: 'случайному союзнику',
    CHOSEN: 'выбранной цели',
    ATTACKER: 'атакующему',
  };
  return map[target] ?? target;
}

/**
 * Формулировка "действие — цель" с русским стилем.
 * Для «действие себе» — только действие («Восстановить 2 здоровья»).
 * Для «действие кому-то» — действие + цель («Нанести 3 урона — всем врагам во Фронте»).
 */
function actionWithTarget(
  action: string,
  target: string,
  selfText?: string,
): string {
  if (target === 'SELF' && selfText) return selfText;
  return `${action} — ${targetText(target)}`;
}

// ─── Условия ───

export function conditionText(cond: any): string {
  if (!cond) return '';
  const kindMap: Record<string, string> = {
    CELLS: 'клеток',
    FRONT_COUNT: 'карт во Фронте',
    GLORY: 'Величия',
    INFLUENCE: 'Влияния',
    HAND_COUNT: 'карт в руке',
    SELF_HEALTH: 'своего здоровья',
    SELF_STRENGTH: 'своей силы',
  };
  const opMap: Record<string, string> = {
    AT_LEAST: '≥',
    AT_MOST: '≤',
    EQUAL: '=',
  };
  const whoMap: Record<string, string> = {
    SELF: 'у тебя ',
    OPPONENT: 'у противника ',
  };
  const who = cond.who ? whoMap[cond.who] : '';
  return `${who}${kindMap[cond.kind] ?? cond.kind} ${opMap[cond.op] ?? cond.op} ${cond.value}`;
}

// ─── Эффекты ───

function sideText(who: string): string {
  return who === 'SELF' ? 'себе' : 'противнику';
}

function sideSubject(who: string): string {
  return who === 'SELF' ? 'Вы' : 'Противник';
}

function selectionText(sel: { from: string; count: number }): string {
  const fromMap: Record<string, string> = {
    ENEMY_FRONT: 'враг во Фронте',
    ENEMY_BOARD: 'враг на доске',
    FRIENDLY_FRONT: 'союзник во Фронте',
    FRIENDLY_BOARD: 'союзник',
    ANY_FRONT: 'карта во Фронте',
    ANY_CARD: 'карта',
  };
  const base = fromMap[sel.from] ?? sel.from;
  const n = sel.count;
  return n > 1
    ? `${n} ${plural(n, 'цель', 'цели', 'целей')} — ${base}`
    : base;
}

export function effectText(effect: any): string {
  switch (effect.kind) {
    case 'DEAL_DAMAGE': {
      const n = effect.amount;
      const action = `Нанести ${n} ${plural(n, 'урон', 'урона', 'урона')}`;
      return actionWithTarget(action, effect.target, 'Нанести урон себе');
    }
    case 'HEAL': {
      const n = effect.amount;
      const action = `Восстановить ${n} ${plural(n, 'здоровье', 'здоровья', 'здоровья')}`;
      return actionWithTarget(action, effect.target);
    }
    case 'BUFF': {
      const parts: string[] = [];
      if (effect.strength) {
        parts.push(`${effect.strength > 0 ? '+' : ''}${effect.strength}⚔`);
      }
      if (effect.health) {
        parts.push(`${effect.health > 0 ? '+' : ''}${effect.health}❤`);
      }
      return actionWithTarget(parts.join(' / '), effect.target);
    }
    case 'DRAW': {
      const n = effect.count;
      const cards = plural(n, 'карта', 'карты', 'карт');
      if (effect.who === 'SELF') {
        return `Взять ${n} ${cards}`;
      }
      return `Противник берёт ${n} ${cards}`;
    }
    case 'GAIN_INFLUENCE': {
      const n = effect.amount;
      if (effect.who === 'SELF') return `+${n} Влияния`;
      return `Противник получает +${n} Влияния`;
    }
    case 'DAMAGE_GLORY': {
      const n = effect.amount;
      const action = `${n} ${plural(n, 'урон', 'урона', 'урона')} Величию`;
      return effect.who === 'SELF' ? `${action} (себе)` : `${action} противника`;
    }
    case 'HEAL_GLORY': {
      const n = effect.amount;
      return effect.who === 'SELF'
        ? `+${n} Величия`
        : `+${n} Величия противнику`;
    }
    case 'SUMMON': {
      const n = effect.count;
      const place =
        effect.destination === 'RESERVE' ? ' в Резерв'
          : effect.destination === 'HAND' ? ' в руку'
            : ' во Фронт';
      return `Призвать «${effect.defId}» ×${n}${place}`;
    }
    case 'RETURN_TO_HAND':
      return actionWithTarget('Вернуть в руку', effect.target);
    case 'RETURN_FROM_DISCARD': {
      const n = effect.count;
      const cards = plural(n, 'карта', 'карты', 'карт');
      const place = effect.destination === 'HAND' ? 'в руку' : 'на верх колоды';
      if (effect.who === 'SELF') return `Вернуть ${n} ${cards} из сброса ${place}`;
      return `Вернуть ${n} ${cards} противника из сброса ${place}`;
    }
    case 'DISCARD_RANDOM': {
      const n = effect.count;
      const cards = plural(n, 'случайную карту', 'случайные карты', 'случайных карт');
      if (effect.who === 'SELF') return `Сбросить ${n} ${cards}`;
      return `Противник сбрасывает ${n} ${cards}`;
    }
    case 'MOVE_CARD': {
      const place = effect.to === 'OWN_RESERVE' ? 'в Резерв' : 'в пустую колонку';
      return actionWithTarget(`Переместить ${place}`, effect.target);
    }
    case 'CHOOSE_TARGETS_THEN': {
      const sel = selectionText(effect.selection);
      const then = (effect.then ?? []).map(effectText).join(', ');
      return `Выбрать: ${sel} → ${then}`;
    }
    default:
      return effect.kind;
  }
}

// ─── Триггер целиком ───

/**
 * Резолвит описание триггера:
 *  - если у триггера есть name/description в JSON — использует их;
 *  - иначе собирает из triggerText + effectText.
 */
export function resolveTrigger(trig: {
  trigger: string;
  name?: string;
  description?: string;
  effects?: any[];
  condition?: any;
  oncePerTurn?: boolean;
}): { name: string; description: string } {
  const name = trig.name ?? triggerText(trig.trigger);
  if (trig.description) {
    return { name, description: trig.description };
  }
  const effects = (trig.effects ?? []).map(effectText).join(', ');
  const cond = trig.condition
    ? `Если ${conditionText(trig.condition)}, то: `
    : '';
  const once = trig.oncePerTurn ? ' Раз в ход.' : '';
  return {
    name,
    description: `${cond}${effects}.${once}`.trim(),
  };
}