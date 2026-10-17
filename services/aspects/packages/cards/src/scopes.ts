/**
 * Scope — множество серий, в рамках которого допустимо колодостроение.
 * Колода целиком должна лежать в одном scope. Кросс-scope-колоды
 * (main + azeroth) считаются ошибкой колодостроения.
 */

export interface ScopeMeta {
  id: string;
  name: string;
  description: string;
  series: string[];
  /** true — «основная игра», фокус баланса и мета-инструментов. */
  primary: boolean;
}

export const SCOPES: Record<string, ScopeMeta> = {
  main: {
    id: 'main',
    name: 'Основная игра',
    description: 'Текущий активный пул серий',
    series: ['classic', 'cradle', 'inner', 'throne'],
    primary: true,
  },
  azeroth: {
    id: 'azeroth',
    name: 'Азерот (legacy)',
    description: 'Штормград · Пламя Пустоты · Апокриф',
    series: ['stormwind', 'voidflame', 'apocryph'],
    primary: false,
  },
  svo: {
    id: 'svo',
    name: 'Современность (legacy)',
    description: 'Стальной Корпус · Разлом · Эхо-7 · Стратос',
    series: ['steel', 'razlom', 'echo', 'sky'],
    primary: false,
  },
};