import type { GameState } from '../types/state';
import type { Command } from '../types/commands';
import type { CardInstanceId, ColumnIndex, PlayerId } from '../types/ids';
import { COLUMN_INDEXES, opponentOf } from '../types/ids';
import {
  columnBonuses,
  findCardLocation,
  frontCount,
  personalityOnBoard,
} from './helpers';

export function getValidActions(
  state: GameState,
  playerId: PlayerId,
): Command[] {
  if (state.winner) return [];
  if (state.activePlayer !== playerId && !state.pendingChoice) return [];

  if (state.pendingChoice) {
    const choice = state.pendingChoice;
    if (choice.playerId !== playerId) return [];

    if (choice.kind === 'EFFECT_TARGET_SELECTION') {
      const actions: Command[] = [];
      actions.push({ type: 'RESOLVE_CHOICE', playerId, cardIds: [] });
      for (const id of choice.eligibleCardIds) {
        actions.push({ type: 'RESOLVE_CHOICE', playerId, cardIds: [id] });
      }
      return actions;
    }

    return [
      {
        type: 'RESOLVE_CHOICE',
        playerId,
        cardIds: choice.eligibleCardIds.slice(0, choice.count),
      },
    ];
  }

  if (state.phase === 'MULLIGAN') {
    if (state.mulliganDone[playerId]) return [];
    const actions: Command[] = [{ type: 'MULLIGAN', playerId, cardId: null }];
    for (const cardId of state.players[playerId].hand) {
      actions.push({ type: 'MULLIGAN', playerId, cardId });
    }
    return actions;
  }

  const actions: Command[] = [];

  actions.push({ type: 'ADVANCE_PHASE', playerId });
  actions.push({ type: 'END_TURN', playerId });

  const player = state.players[playerId];
  const bonuses = columnBonuses(state, playerId);

  if (state.phase === 'PLAY') {
    for (const cardId of player.hand) {
      const card = state.cards[cardId];
      if (!card) continue;
      const def = state.definitions[card.definitionId];
      if (!def) continue;

      if (personalityOnBoard(state, playerId, def.personalityTag)) continue;

      const cost = Math.max(0, def.cost - bonuses.costReduction);
      if (cost > player.influence) continue;

      for (const col of COLUMN_INDEXES) {
        const boardCol = state.board[col - 1];
        const reserveSlot = playerId === 'p1' ? boardCol.p1Reserve : boardCol.p2Reserve;
        if (reserveSlot === null) {
          actions.push({ type: 'PLAY_CARD', playerId, cardId, column: col });
        }
      }
    }

    if (!player.replacementUsedThisTurn) {
      for (const cardId of player.hand) {
        const card = state.cards[cardId];
        if (!card) continue;
        const def = state.definitions[card.definitionId];
        if (!def) continue;

        const match = findMatchingPersonalityOnBoard(state, playerId, def.personalityTag);
        if (!match) continue;

        const cost = Math.max(0, def.cost - bonuses.costReduction);
        if (cost > player.influence) continue;

        actions.push({ type: 'REPLACE_CARD', playerId, cardId });
      }
    }
  }

  if (state.phase === 'PLAY' || state.phase === 'COMBAT') {
    for (const col of state.board) {
      const frontId = playerId === 'p1' ? col.p1Front : col.p2Front;
      if (!frontId) continue;
      const card = state.cards[frontId];
      if (!card) continue;
      const def = state.definitions[card.definitionId];
      if (!def) continue;
      const abilities = def.activatedAbilities ?? [];
      for (let idx = 0; idx < abilities.length; idx++) {
        if (card.usedAbilitiesThisTurn.includes(idx)) continue;
        if (abilities[idx].cost > player.influence) continue;
        actions.push({
          type: 'USE_ABILITY',
          playerId,
          cardId: frontId,
          abilityIndex: idx,
        });
      }
    }
  }

  if (state.phase === 'COMBAT') {
    const opp = opponentOf(playerId);

    for (const col of state.board) {
      const attackerId = playerId === 'p1' ? col.p1Front : col.p2Front;
      if (!attackerId) continue;
      const attacker = state.cards[attackerId];
      if (!attacker || attacker.exhausted) continue;
      const attackerCol = attacker.column as ColumnIndex | null;
      if (!attackerCol) continue;

      const attackerDef = state.definitions[attacker.definitionId];
      const hasScout = attackerDef?.abilities.includes('scout') ?? false;

      let tauntId: CardInstanceId | null = null;
      if (!hasScout) {
        const enemyCol = state.board[attackerCol - 1];
        const enemyFrontId = opp === 'p1' ? enemyCol.p1Front : enemyCol.p2Front;
        if (enemyFrontId) {
          const def = state.definitions[state.cards[enemyFrontId].definitionId];
          if (def?.abilities.includes('taunt')) tauntId = enemyFrontId;
        }
      }

      for (const tcol of state.board) {
        const ef = opp === 'p1' ? tcol.p1Front : tcol.p2Front;
        const er = opp === 'p1' ? tcol.p1Reserve : tcol.p2Reserve;

        if (tauntId) {
          if (ef === tauntId) {
            actions.push({
              type: 'ATTACK',
              playerId,
              attackerId,
              target: { kind: 'CARD', cardId: ef },
            });
          }
          if (hasScout && er) {
            actions.push({
              type: 'ATTACK',
              playerId,
              attackerId,
              target: { kind: 'CARD', cardId: er },
            });
          }
          continue;
        }

        if (ef) {
          actions.push({
            type: 'ATTACK',
            playerId,
            attackerId,
            target: { kind: 'CARD', cardId: ef },
          });
          if (hasScout && er) {
            actions.push({
              type: 'ATTACK',
              playerId,
              attackerId,
              target: { kind: 'CARD', cardId: er },
            });
          }
        } else if (er) {
          actions.push({
            type: 'ATTACK',
            playerId,
            attackerId,
            target: { kind: 'CARD', cardId: er },
          });
        }
      }

      const attackerColData = state.board[attackerCol - 1];
      if (attackerColData.neutralOwner !== playerId) {
        actions.push({
          type: 'ATTACK',
          playerId,
          attackerId,
          target: { kind: 'NEUTRAL', column: attackerCol },
        });
      }

      if (frontCount(state, opp) === 0) {
        actions.push({
          type: 'ATTACK',
          playerId,
          attackerId,
          target: { kind: 'GUILD', playerId: opp },
        });
      }
    }
  }

  return actions;
}

function findMatchingPersonalityOnBoard(
  state: GameState,
  playerId: PlayerId,
  tag: string,
): CardInstanceId | null {
  for (const col of state.board) {
    const ids =
      playerId === 'p1'
        ? [col.p1Front, col.p1Reserve]
        : [col.p2Front, col.p2Reserve];
    for (const id of ids) {
      if (!id) continue;
      const card = state.cards[id];
      if (!card) continue;
      if (!card.sharesIdentity) continue;
      const def = state.definitions[card.definitionId];
      if (def?.personalityTag === tag) return id;
    }
  }
  return null;
}