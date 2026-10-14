export const KEYWORD_TEXT: Record<string, string> = {
  charge: 'Рвение: сразу во Фронт',
  slow: 'Замедление: лишний ход в Резерве',
  vanguard: 'Авангард: во Фронт, если контролируешь клетку',
  taunt: 'Страж: враг обязан атаковать эту карту',
  scout: 'Разведка: может атаковать Резерв напрямую',
  breakthrough: 'Прорыв: избыток урона идёт в Резерв',
  shield: 'Щит: поглощает первый урон',
  suppress: 'Подавление: -1/-1 карте напротив',
  temporary: 'Временная: исчезает через N ходов',
};

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

export const RARITY_TEXT: Record<string, string> = {
  common: 'Обычная',
  uncommon: 'Необычная',
  rare: 'Редкая',
  epic: 'Эпическая',
  legendary: 'Легендарная',
};

export const RARITY_COLOR: Record<string, string> = {
  common: '#6b7280',      // серый
  uncommon: '#22c55e',    // зелёный
  rare: '#3b82f6',        // синий
  epic: '#a855f7',        // фиолетовый
  legendary: '#f59e0b',   // оранжевый
};

export function triggerText(trigger: string): string {
  const map: Record<string, string> = {
    ON_ENTER: 'При входе',
    ON_EXIT: 'При уходе',
    ON_REINFORCE: 'Подкрепление',
    ON_REPLACE: 'При замене',
    ON_TURN_START: 'В начале хода',
    ON_TURN_END: 'В конце хода',
    ON_THIS_DAMAGED: 'При получении урона',
    ON_ALLY_ATTACKED: 'Союзник атакован',
    ON_ENEMY_ATTACK: 'Враг атакует',
    ON_ALLY_DIED: 'Союзник погибает',
  };
  return map[trigger] ?? trigger;
}

function targetText(target: string): string {
  const map: Record<string, string> = {
    SELF: 'себе',
    OWNER_HERO: 'своей гильдии',
    ENEMY_HERO: 'гильдии противника',
    ALL_FRIENDLY_FRONT: 'всем союзникам во Фронте',
    ALL_ENEMY_FRONT: 'всем врагам во Фронте',
    ALL_FRIENDLY_BOARD: 'всем союзникам',
    ALL_ENEMY_BOARD: 'всем врагам',
    ALL_CARDS_ON_BOARD: '⚠ всем картам на доске (и своим тоже)',
    RANDOM_ENEMY_FRONT: 'случайному врагу во Фронте',
    RANDOM_FRIENDLY_FRONT: 'случайному союзнику',
    CHOSEN: 'выбранной цели',
  };
  return map[target] ?? target;
}

function sideText(who: string): string {
  return who === 'SELF' ? 'себе' : 'противнику';
}

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
    SELF: 'у тебя',
    OPPONENT: 'у противника',
  };
  const who = cond.who ? `${whoMap[cond.who]} ` : '';
  return `${who}${kindMap[cond.kind]} ${opMap[cond.op]} ${cond.value}`;
}

export function effectText(effect: any): string {
  switch (effect.kind) {
    case 'DEAL_DAMAGE':
      return `урон ${effect.amount} (${targetText(effect.target)})`;
    case 'HEAL':
      return `лечение ${effect.amount} (${targetText(effect.target)})`;
    case 'BUFF': {
      const parts = [];
      if (effect.strength) parts.push(`${effect.strength > 0 ? '+' : ''}${effect.strength}⚔`);
      if (effect.health) parts.push(`${effect.health > 0 ? '+' : ''}${effect.health}❤`);
      return `${parts.join(' / ')} (${targetText(effect.target)})`;
    }
    case 'DRAW':
      return `взять ${effect.count} ${sideText(effect.who)}`;
    case 'GAIN_INFLUENCE':
      return `+${effect.amount} Влияния ${sideText(effect.who)}`;
    case 'DAMAGE_GLORY':
      return `${effect.amount} урона Величию ${sideText(effect.who)}`;
    case 'HEAL_GLORY':
      return `+${effect.amount} Величия ${sideText(effect.who)}`;
    case 'SUMMON':
      return `призвать «${effect.defId}» ×${effect.count} (${effect.destination ?? 'FRONT'})`;
    case 'RETURN_TO_HAND':
      return `вернуть в руку (${targetText(effect.target)})`;
    case 'RETURN_FROM_DISCARD':
      return `вернуть ${effect.count} из сброса ${sideText(effect.who)} (в ${effect.destination === 'HAND' ? 'руку' : 'колоду'})`;
    case 'DISCARD_RANDOM':
      return `сбросить ${effect.count} случайных ${sideText(effect.who)}`;
    case 'MOVE_CARD':
      return `переместить (${targetText(effect.target)}) → ${effect.to === 'OWN_RESERVE' ? 'в Резерв' : 'в пустую колонку'}`;
    case 'CHOOSE_TARGETS_THEN':
      return `выбрать ${selectionText(effect.selection)} → ${(effect.then ?? []).map(effectText).join(', ')}`;
    default:
      return effect.kind;
  }
}

function selectionText(sel: { from: string; count: number }): string {
  const fromMap: Record<string, string> = {
    ENEMY_FRONT: 'врага во Фронте',
    ENEMY_BOARD: 'врага на доске',
    FRIENDLY_FRONT: 'союзника во Фронте',
    FRIENDLY_BOARD: 'союзника',
    ANY_FRONT: 'карту во Фронте',
    ANY_CARD: 'карту',
  };
  const base = fromMap[sel.from] ?? sel.from;
  return sel.count > 1 ? `${sel.count} × ${base}` : base;
}