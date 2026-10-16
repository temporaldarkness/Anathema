export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export const KEYWORD_IDS = [
  'charge',        // Рвение
  'slow',          // Замедление
  'vanguard',      // Авангард
  'taunt',         // Страж
  'scout',         // Разведка
  'breakthrough',  // Прорыв
  'shield',        // Щит
  'suppress',      // Подавление
  'temporary',      // Временный
] as const;

export type KeywordId = (typeof KEYWORD_IDS)[number];

export const TRIGGER_TYPES = [
  'ON_ENTER',       // Вход (при розыгрыше из руки, не при замене)
  'ON_EXIT',        // Уход (при уходе в сброс, не при замене)
  'ON_REINFORCE',   // Подкрепление (при переходе Резерв→Фронт)
  'ON_REPLACE',     // Замена (когда эта карта заменяет другую)
  'ON_TURN_START',  // В начале хода владельца
  'ON_TURN_END',    // В конце хода владельца
  'ON_THIS_DAMAGED',   // эта карта получила урон
  'ON_ALLY_ATTACKED',  // союзник (того же владельца) атакован
  'ON_ENEMY_ATTACK',   // враг атакует
  'ON_ALLY_DIED',   // союзник умер
] as const;

export type TriggerType = (typeof TRIGGER_TYPES)[number];

export interface TriggeredAbility {
  id?: string;
  trigger: TriggerType;
  condition?: Condition;
  oncePerTurn?: boolean;
  effects: Effect[];
}

export const TARGET_SELECTORS = [
  'SELF',                    // Сама карта
  'OWNER_HERO',              // Гильдия владельца
  'ENEMY_HERO',              // Гильдия противника
  'ALL_FRIENDLY_FRONT',      // Все карты владельца во Фронте
  'ALL_ENEMY_FRONT',         // Все карты противника во Фронте
  'ALL_FRIENDLY_BOARD',      // Все карты владельца во Фронте + Резерве
  'ALL_ENEMY_BOARD',         // Все карты противника во Фронте + Резерве
  'ALL_CARDS_ON_BOARD',      // Все карты на доске, кроме источника
  'RANDOM_ENEMY_FRONT',      // Одна случайная карта противника во Фронте
  'RANDOM_FRIENDLY_FRONT',   // Одна случайная карта владельца во Фронте
  'CHOSEN',                  // Выбранная владельцем карта
  'ATTACKER',                // карта, инициировавшая атаку в текущем контексте
] as const;

export type TargetSelector = (typeof TARGET_SELECTORS)[number];

export type Effect =
  | { kind: 'DEAL_DAMAGE'; amount: number; target: TargetSelector }
  | { kind: 'HEAL'; amount: number; target: TargetSelector }
  | { kind: 'BUFF'; strength: number; health: number; target: TargetSelector }
  | { kind: 'GRANT_SHIELD'; target: TargetSelector }
  | { kind: 'DRAW'; count: number; who: 'SELF' | 'OPPONENT' }
  | { kind: 'GAIN_INFLUENCE'; amount: number; who: 'SELF' | 'OPPONENT' }
  | { kind: 'DAMAGE_GLORY'; amount: number; who: 'SELF' | 'OPPONENT' }
  | { kind: 'HEAL_GLORY'; amount: number; who: 'SELF' | 'OPPONENT' }
  | { kind: 'CHOOSE_TARGETS_THEN'; selection: TargetSelection; then: Effect[]; }
  | { kind: 'SUMMON'; defId: string; count: number; who: 'SELF' | 'OPPONENT'; destination?: 'FRONT' | 'RESERVE' | 'HAND' }
  | { kind: 'RETURN_TO_HAND'; target: TargetSelector; }
  | { kind: 'MOVE_CARD'; target: TargetSelector; to: 'RANDOM_OWN_EMPTY' | 'OWN_RESERVE' }
  | { kind: 'RETURN_FROM_DISCARD'; count: number; who: 'SELF' | 'OPPONENT'; destination: 'HAND' | 'DECK_TOP'; }
  | { kind: 'DISCARD_RANDOM'; count: number; who: 'SELF' | 'OPPONENT'; };

export interface TriggeredAbility {
  trigger: TriggerType;
  condition?: Condition;
  effects: Effect[];
}

export const COMPARATORS = ['AT_LEAST', 'AT_MOST', 'EQUAL'] as const;
export type Comparator = (typeof COMPARATORS)[number];

export const CONDITION_KINDS = [
  'CELLS',        // количество нейтральных клеток
  'FRONT_COUNT',  // количество карт во Фронте
  'GLORY',        // Величие
  'INFLUENCE',    // Влияние
  'HAND_COUNT',   // размер руки
  'SELF_HEALTH',  // текущее здоровье этой карты
  'SELF_STRENGTH',// текущая сила этой карты
] as const;
export type ConditionKind = (typeof CONDITION_KINDS)[number];

export const CONDITION_SIDES = ['SELF', 'OPPONENT'] as const;
export type ConditionSide = (typeof CONDITION_SIDES)[number];

export type Condition =
  | { kind: 'CELLS'; who: ConditionSide; op: Comparator; value: number }
  | { kind: 'FRONT_COUNT'; who: ConditionSide; op: Comparator; value: number }
  | { kind: 'GLORY'; who: ConditionSide; op: Comparator; value: number }
  | { kind: 'INFLUENCE'; who: ConditionSide; op: Comparator; value: number }
  | { kind: 'HAND_COUNT'; who: ConditionSide; op: Comparator; value: number }
  | { kind: 'SELF_HEALTH'; op: Comparator; value: number }
  | { kind: 'SELF_STRENGTH'; op: Comparator; value: number };

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
};