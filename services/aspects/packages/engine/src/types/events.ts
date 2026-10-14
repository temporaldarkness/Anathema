import type { CardInstanceId, ColumnIndex, PlayerId } from './ids';
import type { GameState, Phase, Zone } from './state';

export type GameEvent =
  | { type: 'GAME_STARTED'; seed: string; firstPlayer: PlayerId }
  | { type: 'TURN_STARTED'; playerId: PlayerId; turnNumber: number }
  | { type: 'PHASE_CHANGED'; playerId: PlayerId; phase: Phase }
  | { type: 'CARD_DRAWN'; playerId: PlayerId; cardId: CardInstanceId }
  | { type: 'CARD_DISCARDED'; playerId: PlayerId; cardId: CardInstanceId }
  | { type: 'CARD_PLAYED'; playerId: PlayerId; cardId: CardInstanceId; column: ColumnIndex }
  | {
      type: 'CARD_MOVED';
      cardId: CardInstanceId;
      from: Zone;
      to: Zone;
      column?: ColumnIndex;
    }
  | { type: 'CARD_REPLACED'; oldCardId: CardInstanceId; newCardId: CardInstanceId }
  | { type: 'INFLUENCE_CHANGED'; playerId: PlayerId; delta: number; total: number }
  | { type: 'GLORY_CHANGED'; playerId: PlayerId; delta: number; total: number }
  | {
      type: 'DAMAGE_DEALT';
      targetId: CardInstanceId;
      amount: number;
      source: string;
    }
  | { type: 'SHIELD_ABSORBED'; cardId: CardInstanceId }
  | {
      type: 'DAMAGE_ABSORBED';
      targetId: CardInstanceId;
      absorbed: number;
      reason: 'shield' | 'defense';
    }
  | { type: 'CARD_DIED'; cardId: CardInstanceId; zone: Zone }
  | { type: 'CARD_EXHAUSTED'; cardId: CardInstanceId }
  | { type: 'CARD_RESTORED'; cardId: CardInstanceId }
  | { type: 'NEUTRAL_CAPTURED'; column: ColumnIndex; playerId: PlayerId }
  | { type: 'NEUTRAL_LOST'; column: ColumnIndex; formerOwner: PlayerId }
  | { type: 'ABILITY_TRIGGERED'; cardId: CardInstanceId; abilityId: string }
  | {
      type: 'COMMAND_REJECTED';
      playerId: PlayerId;
      reason: string;
    }
  | { type: 'GAME_OVER'; winner: PlayerId; reason: string }
  | {
      type: 'CHOICE_REQUESTED';
      playerId: PlayerId;
      kind: 'END_TURN_DISCARD' | 'EFFECT_TARGET_SELECTION';
      count: number;
    }
  | {
      type: 'CHOICE_RESOLVED';
      playerId: PlayerId;
      kind: 'END_TURN_DISCARD' | 'EFFECT_TARGET_SELECTION';
    }
  | {
      type: 'MULLIGAN_DONE';
      playerId: PlayerId;
      replaced: boolean;
    }
  | {
      type: 'TOKEN_SUMMONED';
      cardId: CardInstanceId;
      defId: string;
      ownerId: PlayerId;
	  destination: 'FRONT' | 'RESERVE' | 'HAND';
      column: ColumnIndex | null;
    }
  | {
      type: 'TOKEN_LOST';
      defId: string;
      ownerId: PlayerId;
      reason: string;
    };

export type CommandResult = {
  state: GameState;
  events: GameEvent[];
};