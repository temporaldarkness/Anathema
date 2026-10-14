import type { GameState, Command, PlayerId } from '@aspects/engine';

/**
 * Бот — чистая функция: получает снимок GameState и свой playerId,
 * возвращает команду для применения. Никогда не мутирует state.
 *
 * ВАЖНО: `myPlayerId` — это идентификатор того, за кого играет
 * данный экземпляр бота. НЕ совпадает с `state.activePlayer` в
 * фазе MULLIGAN и в `state.pendingChoice`, если выбор адресован
 * не нам.
 */
export interface Bot {
  readonly name: string;
  chooseCommand(state: GameState, myPlayerId: PlayerId): Command | null;
}

export interface SeededBot extends Bot {
  reset(seed: string): void;
}