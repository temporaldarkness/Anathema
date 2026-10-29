/**
 * Scope — множество серий, в рамках которого допустимо колодостроение.
 * Колода целиком должна лежать в одном scope. Кросс-scope-колоды
 * (main + ashenlight) считаются ошибкой колодостроения.
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
    series: ['classic', 'cradle', 'inner', 'throne', 'integration', 'cathedral'],
    primary: true,
  },
  ashenlight: {
    id: 'ashenlight',
    name: 'Пепельный свет (legacy)',
    description: 'Штормград · Пламя Пустоты · Обречённые · Апокриф',
    series: ['ash_stormwind', 'voidflame', 'forsaken', 'apocryph'],
    primary: false,
  },
  oskol: {
    id: 'oskol',
    name: 'Оскол (legacy)',
    description: 'Периметр · Разлом · Эхо-7 · Стратос',
    series: ['perimeter', 'razlom', 'echo', 'sky'],
    primary: false,
  },
};