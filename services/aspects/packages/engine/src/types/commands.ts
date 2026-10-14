import type { CardInstanceId, ColumnIndex, PlayerId } from './ids';

export type AttackTarget =
  | { kind: 'CARD'; cardId: CardInstanceId }
  | { kind: 'NEUTRAL'; column: ColumnIndex }
  | { kind: 'GUILD'; playerId: PlayerId };

export type Command =
  | { type: 'START_GAME' }
  | { type: 'ADVANCE_PHASE'; playerId: PlayerId }
  | {
      type: 'PLAY_CARD';
      playerId: PlayerId;
      cardId: CardInstanceId;
      column: ColumnIndex;
    }
  | {
      type: 'REPLACE_CARD';
      playerId: PlayerId;
      cardId: CardInstanceId;
    }
  | {
      type: 'ATTACK';
      playerId: PlayerId;
      attackerId: CardInstanceId;
      target: AttackTarget;
    }
  | {
      type: 'USE_ABILITY';
      playerId: PlayerId;
      cardId: CardInstanceId;
      abilityIndex: number;
    }
  | { type: 'END_TURN'; playerId: PlayerId }
  | { 
		type: 'MULLIGAN';
		playerId: PlayerId;
		cardId: CardInstanceId | null;
	}
  | {
      type: 'RESOLVE_CHOICE';
      playerId: PlayerId;
      cardIds: CardInstanceId[];
    };