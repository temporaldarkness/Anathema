/**
 * Профили и уровни ботов. Единственный источник истины.
 * Используется:
 *  - фронтом (SetupScreen, BotsModal) — для UI
 *  - бэкендом (tournament.ts, матчмейкинг) — для генерации id
 */
 
import { parseHeuristicName } from './profile';

export interface BotProfile {
  id: string;
  name: string;
  desc: string;
}

export interface BotLevel {
  id: string;
  name: string;
  winrate: string;
}

export const BOT_PROFILES: BotProfile[] = [
  { id: 'balanced',    name: 'Сбалансированный', desc: 'Универсальный' },
  { id: 'aggro',       name: 'Агрессивный',      desc: 'Идёт в лицо' },
  { id: 'defensive',   name: 'Защитный',         desc: 'Копит темп' },
  { id: 'control',     name: 'Контрольный',      desc: 'Долгая игра' },
  { id: 'opportunist', name: 'Оппортунист',      desc: 'Охотник за клетками' },
  { id: 'berserker',   name: 'Берсерк',          desc: 'Безрассудный раш' },
];

export const BOT_LEVELS: BotLevel[] = [
  { id: 'rookie',      name: 'Новичок',      winrate: '25%' },
  { id: 'novice',      name: 'Ученик',       winrate: '33%' },
  { id: 'regular',     name: 'Обычный',      winrate: '42%' },
  { id: 'veteran',     name: 'Ветеран',      winrate: '45%' },
  { id: 'master',      name: 'Мастер',       winrate: '50%' },
  { id: 'grandmaster', name: 'Гроссмейстер', winrate: '50%' },
];

/** Единственная точка, где генерируется id бота. */
export function botName(profile: string, level: string): string {
  return `heuristic-v5-${profile}-${level}`;
}

/** Все возможные id ботов (6 профилей × 6 уровней = 36). */
export function listAllBotIds(): string[] {
  const ids: string[] = [];
  for (const profile of BOT_PROFILES) {
    for (const level of BOT_LEVELS) {
      ids.push(botName(profile.id, level.id));
    }
  }
  return ids;
}

export function botDisplayName(botId: string): string {
  const parsed = parseHeuristicName(botId);
  if (!parsed) return botId;
  const style = BOT_PROFILES.find((p) => p.id === parsed.profileName)?.name
    ?? parsed.profileName;
  const level = BOT_LEVELS.find((l) => l.id === parsed.levelName)?.name
    ?? parsed.levelName;
  return `${style} · ${level}`;
}