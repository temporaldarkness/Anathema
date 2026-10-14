import { PROFILES, LEVELS, parseHeuristicName, type LevelName } from './profile';
import type { Bot } from './types';
import { GreedyBot } from './greedy';
import { HeuristicBot, type HeuristicOptions } from './heuristic';
import { MctsBot } from './mcts';

/**
 * Набор фич, доступных на каждом уровне.
 *
 * Принцип: гроссмейстер умеет ВСЁ, что умеют более слабые,
 * плюс дополнительно. Руки не «докручиваются» у rookie —
 * наоборот, у grandmaster'а ОТКРЫВАЮТСЯ возможности.
 *
 * Флаги v5Lookahead и v5AltVictory сознательно не используются:
 * тестирование показало, что их включение ухудшает игру.
 * Они остаются в коде HeuristicBot как эксперимент.
 */
interface LevelFeatures {
  play: boolean;
  attack: boolean;
  ability: boolean;
  smartAbility: boolean;
  smartDiscard: boolean;
  smartMulligan: boolean;
  smartReplace: boolean;
  column5Penalty: boolean;
  v4Attack: boolean;
  v4Triggers: boolean;
  v4MulliganV2: boolean;
  v4ReplaceV2: boolean;
  lateGameNeutralFix: boolean;
}

const BASE_FEATURES: LevelFeatures = {
  play: true,
  attack: true,
  ability: false,
  smartAbility: false,
  smartDiscard: false,
  smartMulligan: false,
  smartReplace: false,
  column5Penalty: false,
  v4Attack: false,
  v4Triggers: false,
  v4MulliganV2: false,
  v4ReplaceV2: false,
  lateGameNeutralFix: false,
};

const LEVEL_FEATURES: Record<LevelName, LevelFeatures> = {
  // Rookie: голый бот — без замен, без сброса по уму,
  // без триггеров, без способностей. Простой greedy + шум.
  rookie: {
    ...BASE_FEATURES,
  },

  // Novice: + умный муллиган.
  novice: {
    ...BASE_FEATURES,
    v4MulliganV2: true,
  },

  // Regular: + умная замена + штраф колонки 5 в лейте.
  regular: {
    ...BASE_FEATURES,
    v4MulliganV2: true,
    smartReplace: true,
    column5Penalty: true,
  },

  // Veteran: + умный сброс + фикс нейтралов в лейтгейме.
  veteran: {
    ...BASE_FEATURES,
    v4MulliganV2: true,
    smartReplace: true,
    column5Penalty: true,
    smartDiscard: true,
    lateGameNeutralFix: true,
  },

  // Master: + улучшенная атака, + триггеры, + активируемые способности.
  master: {
    play: true,
    attack: true,
    ability: true,
    smartAbility: true,
    smartDiscard: true,
    smartMulligan: true,
    smartReplace: true,
    column5Penalty: true,
    v4Attack: true,
    v4Triggers: true,
    v4MulliganV2: true,
    v4ReplaceV2: true,
    lateGameNeutralFix: true,
  },

  // Grandmaster: тот же набор, но с нулевым шумом.
  grandmaster: {
    play: true,
    attack: true,
    ability: true,
    smartAbility: true,
    smartDiscard: true,
    smartMulligan: true,
    smartReplace: true,
    column5Penalty: true,
    v4Attack: true,
    v4Triggers: true,
    v4MulliganV2: true,
    v4ReplaceV2: true,
    lateGameNeutralFix: true,
  },
};

function buildHeuristic(
  parsed: NonNullable<ReturnType<typeof parseHeuristicName>>,
): Bot {
  const features = LEVEL_FEATURES[parsed.levelName];
  const profile = PROFILES[parsed.profileName];
  const level = LEVELS[parsed.levelName];
  const name = `Heuristic-${parsed.base}-${parsed.profileName}-${parsed.levelName}`;

  const opts: HeuristicOptions = {
    ...features,
    profile,
    temperature: level.temperature,
    mistakeRate: level.mistakeRate,
    mistakeWidth: level.mistakeWidth,
  };

  return new HeuristicBot(name, opts);
}

export function makeBot(name: string): Bot {
  switch (name) {
    case 'greedy': return new GreedyBot('Greedy');
    case 'heuristic': return new HeuristicBot('Heuristic');
    case 'heuristic-play':
      return new HeuristicBot('HeuristicPlay', {
        play: true, attack: false, ability: false,
      });
    case 'heuristic-attack':
      return new HeuristicBot('HeuristicAttack', {
        play: false, attack: true, ability: false,
      });
    case 'mcts':
      return new MctsBot({ name: 'Mcts' });
    case 'mcts-fast':
      return new MctsBot({ name: 'MctsFast', budgetMs: 200, maxIterations: 100 });
    case 'mcts-slow':
      return new MctsBot({ name: 'MctsSlow', budgetMs: 2000, maxIterations: 1500 });
    case 'mcts-deep':
      return new MctsBot({ name: 'MctsDeep', budgetMs: 1000, rolloutDepth: 20 });
  }

  const parsed = parseHeuristicName(name);
  if (parsed) return buildHeuristic(parsed);

  throw new Error(
    `Unknown bot: "${name}".\n` +
    `Bots:  greedy | heuristic | heuristic-play | heuristic-attack | mcts* |\n` +
    `       heuristic-v4[-{profile}][-{level}] | heuristic-v5[-{profile}][-{level}]\n` +
    `Profiles: ${Object.keys(PROFILES).join(', ')}\n` +
    `Levels:   ${Object.keys(LEVELS).join(', ')}`,
  );
}