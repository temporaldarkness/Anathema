/**
 * Единая точка доступа к ботам для всех инструментов.
 * Проксирует @aspects/bot, чтобы скрипты не разбирались с импортами.
 */
export {
  makeBot,
  listAllBotIds,
} from '@aspects/bot';

export type { Bot } from '@aspects/bot';