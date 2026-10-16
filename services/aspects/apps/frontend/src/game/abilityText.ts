import { KEYWORD_INFO, type CardDefinition } from '@aspects/cards';

// ─── Плюрализация ───

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
  shield: '🔷',
  suppress: '⬇',
  temporary: '⏱',
  armored: '🔰',
  regenerate: '💚',
  cleave: '🗡',
  frenzy: '🔥',
  starter: '⭐',
};

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
  if (kw === 'cleave') {
    const n = (card as any)?.cleaveDamage ?? 1;
    return {
      name: 'Рассечение',
      description: `При атаке по карте соседи цели по колонкам получают ${n} урона. Соседи не отвечают ударом.`,
    };
  }
  const shared = (KEYWORD_INFO as Record<string, { name: string; description: string }>)[kw];
  if (shared) return shared;
  return { name: kw, description: '' };
}

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
  ON_ATTACK: '🎯',
  ON_KILL: '☠️',
  ON_CELL_CAPTURED: '🚩',
  ON_CELL_LOST: '⚑',
  ON_DAMAGE_DEALT: '💢',
  ON_CARD_DRAWN: '🃏',
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
    ON_ATTACK: 'Перед атакой этой карты',
    ON_KILL: 'Когда эта карта убивает другую',
    ON_CELL_CAPTURED: 'Когда ты захватываешь нейтрал',
    ON_CELL_LOST: 'Когда ты теряешь нейтрал',
    ON_DAMAGE_DEALT: 'Когда эта карта наносит урон',
    ON_CARD_DRAWN: 'Когда ты берёшь карту',
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
    OPPOSITE: 'карте напротив',
  };
  return map[target] ?? target;
}

function actionWithTarget(
  action: string,
  target: string,
  selfText?: string,
): string {
  if (target === 'SELF' && selfText) return selfText;
  return `${action} — ${targetText(target)}`;
}

function filterHint(filter: any): string {
  if (!filter) return '';
  if (filter.tag) return ` [тег «${filter.tag}»]`;
  if (filter.keyword) return ` [${filter.keyword}]`;
  if (filter.withoutShield) return ' [без щита]';
  if (filter.maxCost != null) return ` [стоимость ≤ ${filter.maxCost}]`;
  if (filter.minCost != null) return ` [стоимость ≥ ${filter.minCost}]`;
  if (filter.minStrength != null) return ` [сила ≥ ${filter.minStrength}]`;
  return '';
}

// ─── Условия ───

function isComposite(c: any): boolean {
  return c?.kind === 'AND' || c?.kind === 'OR' || c?.kind === 'NOT';
}

export function conditionText(cond: any): string {
  if (!cond) return '';

  if (cond.kind === 'AND') {
    return (cond.conditions ?? [])
      .map((c: any) => (isComposite(c) ? `(${conditionText(c)})` : conditionText(c)))
      .join(' И ');
  }
  if (cond.kind === 'OR') {
    return (cond.conditions ?? [])
      .map((c: any) => (isComposite(c) ? `(${conditionText(c)})` : conditionText(c)))
      .join(' ИЛИ ');
  }
  if (cond.kind === 'NOT') {
    return `не (${conditionText(cond.condition)})`;
  }

  const kindMap: Record<string, string> = {
    CELLS: 'клеток',
    FRONT_COUNT: 'карт во Фронте',
    GLORY: 'Величия',
    INFLUENCE: 'Влияния',
    HAND_COUNT: 'карт в руке',
    SELF_HEALTH: 'своего здоровья',
    SELF_STRENGTH: 'своей силы',
    TOTAL_STRENGTH: 'суммарной силы',
    TOTAL_HEALTH: 'суммарного здоровья',
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

  switch (cond.kind) {
    case 'IN_RESERVE':
      return 'карта в Резерве';
    case 'IN_FRONT':
      return 'карта во Фронте';
    case 'IS_FIRST_PLAYER':
      return 'ты первый игрок';
    case 'TURN_NUMBER':
      return `номер хода ${opMap[cond.op] ?? cond.op} ${cond.value}`;
    case 'SELF_HEALTH':
    case 'SELF_STRENGTH':
      return `${kindMap[cond.kind]} ${opMap[cond.op] ?? cond.op} ${cond.value}`;
    default: {
      const who = cond.who ? whoMap[cond.who] ?? '' : '';
      const fh = filterHint(cond.filter);
      return `${who}${kindMap[cond.kind] ?? cond.kind} ${opMap[cond.op] ?? cond.op} ${cond.value}${fh}`;
    }
  }
}

// ─── Эффекты ───

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
      const action = `Нанести ${n} ${plural(n, 'урон', 'урона', 'урона')}${filterHint(effect.filter)}`;
      return actionWithTarget(action, effect.target, 'Нанести урон себе');
    }
    case 'HEAL': {
      const n = effect.amount;
      const action = `Восстановить ${n} ${plural(n, 'здоровье', 'здоровья', 'здоровья')}${filterHint(effect.filter)}`;
      return actionWithTarget(action, effect.target);
    }
    case 'BUFF': {
      const parts: string[] = [];
      if (effect.strength) parts.push(`${effect.strength > 0 ? '+' : ''}${effect.strength}⚔`);
      if (effect.health) parts.push(`${effect.health > 0 ? '+' : ''}${effect.health}❤`);
      const body = parts.join(' / ') + filterHint(effect.filter);
      return actionWithTarget(body, effect.target);
    }
    case 'GRANT_SHIELD':
      return actionWithTarget('Дать щит', effect.target, 'Получить щит');
    case 'EXHAUST_TARGET':
      return actionWithTarget('Истощить (заморозить)', effect.target);
    case 'UNEXHAUST_TARGET':
      return actionWithTarget('Разморозить', effect.target);
    case 'SILENCE_TARGET':
      return actionWithTarget('Обезвредить (снять способности)', effect.target);
    case 'DRAW': {
      const n = effect.count;
      const cards = plural(n, 'карта', 'карты', 'карт');
      return effect.who === 'SELF'
        ? `Взять ${n} ${cards}`
        : `Противник берёт ${n} ${cards}`;
    }
    case 'GAIN_INFLUENCE': {
      const n = effect.amount;
      return effect.who === 'SELF'
        ? `+${n} Влияния`
        : `Противник получает +${n} Влияния`;
    }
    case 'SPEND_INFLUENCE': {
      const n = effect.amount;
      return effect.who === 'SELF'
        ? `−${n} Влияния`
        : `Противник теряет ${n} Влияния`;
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
      return effect.who === 'SELF'
        ? `Вернуть ${n} ${cards} из сброса ${place}`
        : `Вернуть ${n} ${cards} противника из сброса ${place}`;
    }
    case 'DISCARD_RANDOM': {
      const n = effect.count;
      const cards = plural(n, 'случайную карту', 'случайные карты', 'случайных карт');
      return effect.who === 'SELF'
        ? `Сбросить ${n} ${cards}`
        : `Противник сбрасывает ${n} ${cards}`;
    }
    case 'DISCARD_CHOSEN': {
      const n = effect.count;
      const cards = plural(n, 'карту', 'карты', 'карт');
      return effect.who === 'SELF'
        ? `Сбросить ${n} ${cards} (по выбору противника)`
        : `Противник сбрасывает ${n} ${cards} (по твоему выбору)`;
    }
    case 'MOVE_CARD': {
      const place = effect.to === 'OWN_RESERVE' ? 'в Резерв' : 'в пустую колонку';
      return actionWithTarget(`Переместить ${place}`, effect.target);
    }
    case 'MOVE_TO_COLUMN':
      return actionWithTarget(`Переместить в колонку ${effect.column}`, effect.target);
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