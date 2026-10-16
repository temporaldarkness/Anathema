import { produce } from 'immer';
import type { GameState } from '../types/state';
import type { Command } from '../types/commands';
import type { GameEvent } from '../types/events';
import type { ResolutionContext } from '../types/resolution';
import { advancePhaseInternal } from './advancePhase';
import { playCardInternal } from './playCard';
import { endTurnInternal } from './endTurn';
import { attackInternal } from './attack';
import { replaceInternal } from './replace';
import { resolveChoiceInternal } from './resolveChoice';
import { cancelChoiceInternal } from './cancelChoice';
import { useAbilityInternal } from './useAbility';
import { mulliganInternal } from './mulligan';
import { drainTriggerQueue } from '../abilities/triggerQueue';
import { notifyCellCaptured, notifyCellLost } from '../abilities/cellEvents';
import { recomputeSuppression, checkSuppressionDeaths } from '../state/suppression';
import { killCard } from '../state/mutations';

export interface ApplyResult {
  state: GameState;
  events: GameEvent[];
}

export function applyCommand(state: GameState, cmd: Command): ApplyResult {
  const ctx: ResolutionContext = { events: [], pendingNeutralCaptures: [] };

  if (state.winner) {
    ctx.events.push({ type: 'COMMAND_REJECTED', playerId: 'p1', reason: 'game_already_over' });
    return { state, events: ctx.events };
  }

  if (state.phase === 'MULLIGAN' && cmd.type !== 'MULLIGAN') {
    ctx.events.push({
      type: 'COMMAND_REJECTED',
      playerId: state.activePlayer,
      reason: 'not_mulligan_command',
    });
    return { state, events: ctx.events };
  }

  if (
    state.pendingChoice &&
    cmd.type !== 'RESOLVE_CHOICE' &&
    cmd.type !== 'CANCEL_CHOICE'
  ) {
    ctx.events.push({
      type: 'COMMAND_REJECTED',
      playerId: state.pendingChoice.playerId,
      reason: 'awaiting_choice',
    });
    return { state, events: ctx.events };
  }

  const nextState = produce(state, (draft) => {
    recomputeSuppression(draft);
    for (const id of checkSuppressionDeaths(draft)) {
      killCard(draft, id as any, ctx);
    }
    drainTriggerQueue(draft, ctx);

    switch (cmd.type) {
      case 'MULLIGAN': {
        const res = mulliganInternal(
          draft,
          { playerId: cmd.playerId, cardId: cmd.cardId },
          ctx,
        );
        if (!res.ok) {
          ctx.events.push({
            type: 'COMMAND_REJECTED',
            playerId: cmd.playerId,
            reason: res.reason,
          });
        }
        break;
      }
      case 'ADVANCE_PHASE': {
        if (draft.activePlayer !== cmd.playerId) {
          ctx.events.push({ type: 'COMMAND_REJECTED', playerId: cmd.playerId, reason: 'not_your_turn' });
          return;
        }
        advancePhaseInternal(draft, ctx);
        break;
      }
      case 'PLAY_CARD': {
        const res = playCardInternal(
          draft,
          { playerId: cmd.playerId, cardId: cmd.cardId, column: cmd.column },
          ctx,
        );
        if (!res.ok) {
          ctx.events.push({ type: 'COMMAND_REJECTED', playerId: cmd.playerId, reason: res.reason });
        }
        break;
      }
      case 'REPLACE_CARD': {
        const res = replaceInternal(
          draft,
          { playerId: cmd.playerId, cardId: cmd.cardId },
          ctx,
        );
        if (!res.ok) {
          ctx.events.push({ type: 'COMMAND_REJECTED', playerId: cmd.playerId, reason: res.reason });
        }
        break;
      }
      case 'ATTACK': {
        const res = attackInternal(
          draft,
          { playerId: cmd.playerId, attackerId: cmd.attackerId, target: cmd.target },
          ctx,
        );
        if (!res.ok) {
          ctx.events.push({ type: 'COMMAND_REJECTED', playerId: cmd.playerId, reason: res.reason });
        }
        break;
      }
      case 'END_TURN': {
        const res = endTurnInternal(draft, cmd.playerId, ctx);
        if (!res.ok) {
          ctx.events.push({ type: 'COMMAND_REJECTED', playerId: cmd.playerId, reason: res.reason });
        }
        break;
      }
      case 'USE_ABILITY': {
        const res = useAbilityInternal(
          draft,
          {
            playerId: cmd.playerId,
            cardId: cmd.cardId,
            abilityIndex: cmd.abilityIndex,
          },
          ctx,
        );
        if (!res.ok) {
          ctx.events.push({ type: 'COMMAND_REJECTED', playerId: cmd.playerId, reason: res.reason });
        }
        break;
      }
      case 'RESOLVE_CHOICE': {
        const res = resolveChoiceInternal(
          draft,
          { playerId: cmd.playerId, cardIds: cmd.cardIds },
          ctx,
        );
        if (!res.ok) {
          ctx.events.push({ type: 'COMMAND_REJECTED', playerId: cmd.playerId, reason: res.reason });
        }
        break;
      }
      case 'CANCEL_CHOICE': {
        const res = cancelChoiceInternal(
          draft,
          { playerId: cmd.playerId },
          ctx,
        );
        if (!res.ok) {
          ctx.events.push({ type: 'COMMAND_REJECTED', playerId: cmd.playerId, reason: res.reason });
        }
        break;
      }
      default: {
        ctx.events.push({
          type: 'COMMAND_REJECTED',
          playerId: draft.activePlayer,
          reason: 'unsupported_command',
        });
      }
    }

    drainTriggerQueue(draft, ctx);

    recomputeSuppression(draft);
    for (const id of checkSuppressionDeaths(draft)) {
      killCard(draft, id as any, ctx);
    }
    drainTriggerQueue(draft, ctx);

    for (const cap of ctx.pendingNeutralCaptures) {
      const attacker = draft.cards[cap.attackerId];
      if (!attacker || attacker.zone === 'DISCARD') continue;
      const col = draft.board[cap.column - 1];
      const oldOwner = col.neutralOwner;
      if (oldOwner === cap.playerId) continue;
      col.neutralOwner = cap.playerId;
      if (oldOwner) {
        ctx.events.push({
          type: 'NEUTRAL_LOST',
          column: cap.column,
          formerOwner: oldOwner,
        });
        notifyCellLost(draft, cap.column, oldOwner);
      }
      ctx.events.push({
        type: 'NEUTRAL_CAPTURED',
        column: cap.column,
        playerId: cap.playerId,
      });
      notifyCellCaptured(draft, cap.column, cap.playerId);
    }

    // Отложенные захваты могли энкьюить ON_CELL_CAPTURED / ON_CELL_LOST.
    // Дрейним их до конца команды, чтобы состояние вернулось к клиенту
    // уже с разрешёнными триггерами.
    drainTriggerQueue(draft, ctx);
  });

  return { state: nextState, events: ctx.events };
}