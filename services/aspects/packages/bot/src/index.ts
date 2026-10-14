export * from './types';
export { GreedyBot } from './greedy';
export { HeuristicBot } from './heuristic';
export { makeBot } from './bot-factory';
export {
  BOT_PROFILES,
  BOT_LEVELS,
  botName,
  listAllBotIds,
  botDisplayName,
  type BotProfile,
  type BotLevel,
} from './config';