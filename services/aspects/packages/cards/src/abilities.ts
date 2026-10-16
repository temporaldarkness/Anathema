export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export const KEYWORD_IDS = [
  'charge',
  'slow',
  'vanguard',
  'taunt',
  'scout',
  'breakthrough',
  'shield',
  'suppress',
  'temporary',
  'armored',
  'regenerate',
  'cleave',
  'frenzy',
  'starter',
] as const;

export type KeywordId = (typeof KEYWORD_IDS)[number];

export const TRIGGER_TYPES = [
  'ON_ENTER',
  'ON_EXIT',
  'ON_REINFORCE',
  'ON_REPLACE',
  'ON_TURN_START',
  'ON_TURN_END',
  'ON_THIS_DAMAGED',
  'ON_ALLY_ATTACKED',
  'ON_ENEMY_ATTACK',
  'ON_ALLY_DIED',
  'ON_ATTACK',
  'ON_KILL',
  'ON_CELL_CAPTURED',
  'ON_CELL_LOST',
  'ON_DAMAGE_DEALT',
  'ON_CARD_DRAWN',
] as const;

export type TriggerType = (typeof TRIGGER_TYPES)[number];

export const TARGET_SELECTORS = [
  'SELF',
  'OWNER_HERO',
  'ENEMY_HERO',
  'ALL_FRIENDLY_FRONT',
  'ALL_ENEMY_FRONT',
  'ALL_FRIENDLY_BOARD',
  'ALL_ENEMY_BOARD',
  'ALL_CARDS_ON_BOARD',
  'RANDOM_ENEMY_FRONT',
  'RANDOM_FRIENDLY_FRONT',
  'CHOSEN',
  'ATTACKER',
  'OPPOSITE',
] as const;

export type TargetSelector = (typeof TARGET_SELECTORS)[number];

export interface CardFilter {
  tag?: string;
  keyword?: KeywordId;
  minStrength?: number;
  maxStrength?: number;
  minCost?: number;
  maxCost?: number;
  withoutShield?: boolean;
}

export type Effect =
  | { kind: 'DEAL_DAMAGE'; amount: number; target: TargetSelector; filter?: CardFilter }
  | { kind: 'HEAL'; amount: number; target: TargetSelector; filter?: CardFilter }
  | { kind: 'BUFF'; strength: number; health: number; target: TargetSelector; filter?: CardFilter }
  | { kind: 'GRANT_SHIELD'; target: TargetSelector; filter?: CardFilter }
  | { kind: 'EXHAUST_TARGET'; target: TargetSelector; filter?: CardFilter }
  | { kind: 'UNEXHAUST_TARGET'; target: TargetSelector; filter?: CardFilter }
  | { kind: 'SILENCE_TARGET'; target: TargetSelector; filter?: CardFilter }
  | { kind: 'DRAW'; count: number; who: 'SELF' | 'OPPONENT' }
  | { kind: 'GAIN_INFLUENCE'; amount: number; who: 'SELF' | 'OPPONENT' }
  | { kind: 'SPEND_INFLUENCE'; amount: number; who: 'SELF' | 'OPPONENT' }
  | { kind: 'DAMAGE_GLORY'; amount: number; who: 'SELF' | 'OPPONENT' }
  | { kind: 'HEAL_GLORY'; amount: number; who: 'SELF' | 'OPPONENT' }
  | { kind: 'CHOOSE_TARGETS_THEN'; selection: TargetSelection; then: Effect[] }
  | { kind: 'SUMMON'; defId: string; count: number; who: 'SELF' | 'OPPONENT'; destination?: 'FRONT' | 'RESERVE' | 'HAND' }
  | { kind: 'RETURN_TO_HAND'; target: TargetSelector; filter?: CardFilter }
  | { kind: 'MOVE_CARD'; target: TargetSelector; filter?: CardFilter; to: 'RANDOM_OWN_EMPTY' | 'OWN_RESERVE' }
  | { kind: 'MOVE_TO_COLUMN'; target: TargetSelector; filter?: CardFilter; column: number }
  | { kind: 'RETURN_FROM_DISCARD'; count: number; who: 'SELF' | 'OPPONENT'; destination: 'HAND' | 'DECK_TOP' }
  | { kind: 'DISCARD_RANDOM'; count: number; who: 'SELF' | 'OPPONENT' }
  | { kind: 'DISCARD_CHOSEN'; count: number; who: 'SELF' | 'OPPONENT' };

export interface TriggeredAbility {
  id?: string;
  trigger: TriggerType;
  condition?: Condition;
  oncePerTurn?: boolean;
  effects: Effect[];
}

export const COMPARATORS = ['AT_LEAST', 'AT_MOST', 'EQUAL'] as const;
export type Comparator = (typeof COMPARATORS)[number];

export const CONDITION_KINDS = [
  'CELLS',
  'FRONT_COUNT',
  'GLORY',
  'INFLUENCE',
  'HAND_COUNT',
  'SELF_HEALTH',
  'SELF_STRENGTH',
  'TOTAL_STRENGTH',
  'TOTAL_HEALTH',
  'IN_RESERVE',
  'IN_FRONT',
  'TURN_NUMBER',
  'IS_FIRST_PLAYER',
  'AND',
  'OR',
  'NOT',
] as const;
export type ConditionKind = (typeof CONDITION_KINDS)[number];

export const CONDITION_SIDES = ['SELF', 'OPPONENT'] as const;
export type ConditionSide = (typeof CONDITION_SIDES)[number];

export type Condition =
  | { kind: 'CELLS'; who: ConditionSide; op: Comparator; value: number }
  | { kind: 'FRONT_COUNT'; who: ConditionSide; op: Comparator; value: number; filter?: CardFilter }
  | { kind: 'GLORY'; who: ConditionSide; op: Comparator; value: number }
  | { kind: 'INFLUENCE'; who: ConditionSide; op: Comparator; value: number }
  | { kind: 'HAND_COUNT'; who: ConditionSide; op: Comparator; value: number; filter?: CardFilter }
  | { kind: 'SELF_HEALTH'; op: Comparator; value: number }
  | { kind: 'SELF_STRENGTH'; op: Comparator; value: number }
  | { kind: 'TOTAL_STRENGTH'; who: ConditionSide; op: Comparator; value: number; filter?: CardFilter }
  | { kind: 'TOTAL_HEALTH'; who: ConditionSide; op: Comparator; value: number; filter?: CardFilter }
  | { kind: 'IN_RESERVE' }
  | { kind: 'IN_FRONT' }
  | { kind: 'TURN_NUMBER'; op: Comparator; value: number }
  | { kind: 'IS_FIRST_PLAYER' }
  | { kind: 'AND'; conditions: Condition[] }
  | { kind: 'OR'; conditions: Condition[] }
  | { kind: 'NOT'; condition: Condition };

export const TARGET_SELECTION_SOURCES = [
  'ENEMY_FRONT',
  'ENEMY_BOARD',
  'FRIENDLY_FRONT',
  'FRIENDLY_BOARD',
  'ANY_FRONT',
  'ANY_CARD',
] as const;
export type TargetSelectionSource = (typeof TARGET_SELECTION_SOURCES)[number];

export interface TargetSelection {
  from: TargetSelectionSource;
  count: number;
}

export interface ActivatedAbility {
  id: string;
  cost: number;
  effects: Effect[];
  discardCost?: number;
}

export const FACTION_IDS = [
  'sky',
  'echo',
  'razlom',
  'steel',
  'apocryph',
  'voidflame',
  'stormwind',
  'enterprise',
  'ganimed',
  'burgundy',
] as const;

export type FactionId = (typeof FACTION_IDS)[number];

export function isFactionTag(tag: string): tag is FactionId {
  return (FACTION_IDS as readonly string[]).includes(tag);
}

export interface KeywordInfo {
  name: string;
  description: string;
}

export const KEYWORD_INFO: Record<KeywordId, KeywordInfo> = {
  charge: {
    name: 'Рвение',
    description: 'При розыгрыше карта сразу переходит во Фронт, минуя Резерв.',
  },
  slow: {
    name: 'Замедление',
    description: 'Карта пропускает свой первый плановый переход из Резерва во Фронт.',
  },
  vanguard: {
    name: 'Авангард',
    description: 'Можно разыграть сразу во Фронт, если ты контролируешь нейтрал в этой колонке.',
  },
  taunt: {
    name: 'Страж',
    description: 'Противник в этой колонке вынужден атаковать эту карту, если может.',
  },
  scout: {
    name: 'Разведка',
    description: 'Может атаковать Резерв противника, даже если Фронт перед ним занят. Игнорирует Страж.',
  },
  breakthrough: {
    name: 'Прорыв',
    description: 'Если эта карта убивает защитника во Фронте — избыточный урон идёт карте в Резерве за ним.',
  },
  shield: {
    name: 'Щит',
    description: 'Поглощает первый входящий урон полностью, включая урон от способностей. После поглощения снимается.',
  },
  suppress: {
    name: 'Подавление',
    description: 'Карта напротив в той же колонке получает −1 силы и −1 здоровья. Действует постоянно.',
  },
  temporary: {
    name: 'Временная',
    description: 'Карта исчезает с поля через указанное число ходов.',
  },
  armored: {
    name: 'Броня',
    description: 'Уменьшает весь входящий урон на 1 (минимум 0). Работает во всех зонах.',
  },
  regenerate: {
    name: 'Регенерация',
    description: 'В конце своего хода восстанавливает 1 здоровья (не сверх максимума).',
  },
  cleave: {
    name: 'Рассечение',
    description: 'При атаке по карте соседи цели по колонкам получают урон, равный значению cleaveDamage (по умолчанию 1). Соседи не отвечают ударом.',
  },
  frenzy: {
    name: 'Ярость',
    description: 'Может атаковать дважды за ход.',
  },
  starter: {
    name: 'Стартовый',
    description: 'Если в колоде есть карта с этим свойством — одна из них (случайная) гарантированно попадает в стартовую руку до Mulligan.',
  },
};