import type {
  GameState,
  Command,
  CardInstanceId,
  PlayerId,
} from '@aspects/engine';
import {
  getValidActions,
  health,
  strength,
  strengthInBattle,
  opponentOf,
} from '@aspects/engine';
import type { Bot } from './types';

type PlayCommand = Extract<Command, { type: 'PLAY_CARD' }>;
type AttackCommand = Extract<Command, { type: 'ATTACK' }>;
type ResolveCommand = Extract<Command, { type: 'RESOLVE_CHOICE' }>;

export class GreedyBot implements Bot {
  readonly name: string;

  constructor(name: string = 'GreedyBot') {
    this.name = name;
  }

  chooseCommand(state: GameState, myPlayerId: PlayerId): Command | null {
    if (state.winner) return null;

    if (state.pendingChoice) {
      if (state.pendingChoice.playerId !== myPlayerId) return null;
      return this.resolveChoice(state, myPlayerId);
    }

    if (state.phase === 'MULLIGAN') {
      if (state.mulliganDone[myPlayerId]) return null;
      return { type: 'MULLIGAN', playerId: myPlayerId, cardId: null };
    }

    if (state.activePlayer !== myPlayerId) return null;

    const actions = getValidActions(state, myPlayerId);
    if (actions.length === 0) return null;

    switch (state.phase) {
      case 'PLAY':
        return (
          this.pickPlayCard(state, actions) ??
          this.pickAdvance(actions, myPlayerId)
        );

      case 'COMBAT':
        return (
          this.pickAttack(state, myPlayerId, actions) ??
          this.pickEndTurn(actions, myPlayerId)
        );

      default:
        return this.pickAdvance(actions, myPlayerId);
    }
  }

  private resolveChoice(state: GameState, myPlayerId: PlayerId): Command | null {
    const choice = state.pendingChoice;
    if (!choice) return null;

    const actions = getValidActions(state, myPlayerId);
    const resolves = actions.filter(
      (a): a is ResolveCommand => a.type === 'RESOLVE_CHOICE',
    );
    if (resolves.length === 0) return null;

    if (choice.kind !== 'EFFECT_TARGET_SELECTION') {
      return resolves[0];
    }

    let best: ResolveCommand | null = null;
    let bestScore = -Infinity;
    for (const r of resolves) {
      if (r.cardIds.length === 0) continue;
      const score = this.scoreChoiceTargets(state, myPlayerId, r.cardIds);
      if (score > bestScore) {
        bestScore = score;
        best = r;
      }
    }
    return best ?? resolves[0];
  }

  private scoreChoiceTargets(
    state: GameState,
    myPlayerId: PlayerId,
    cardIds: readonly CardInstanceId[],
  ): number {
    const opp = opponentOf(myPlayerId);
    let score = 0;
    for (const id of cardIds) {
      const card = state.cards[id];
      if (!card) continue;
      const hp = health(card);
      if (card.controllerId === opp) score += 20 - hp;
      else score -= 20 - hp;
    }
    return score;
  }

  private pickPlayCard(
    state: GameState,
    actions: readonly Command[],
  ): PlayCommand | null {
    let best: PlayCommand | null = null;
    let bestCost = -1;
    for (const a of actions) {
      if (a.type !== 'PLAY_CARD') continue;
      const card = state.cards[a.cardId];
      if (!card) continue;
      const def = state.definitions[card.definitionId];
      if (!def) continue;
      if (def.cost > bestCost) {
        bestCost = def.cost;
        best = a;
      }
    }
    return best;
  }

  private pickAttack(
    state: GameState,
    myPlayerId: PlayerId,
    actions: readonly Command[],
  ): AttackCommand | null {
    let best: AttackCommand | null = null;
    let bestScore = -Infinity;
    for (const a of actions) {
      if (a.type !== 'ATTACK') continue;
      const score = this.scoreAttack(state, myPlayerId, a);
      if (score > bestScore) {
        bestScore = score;
        best = a;
      }
    }
    if (bestScore < 0) return null;
    return best;
  }

  private scoreAttack(
    state: GameState,
    myPlayerId: PlayerId,
    attack: AttackCommand,
  ): number {
    const attacker = state.cards[attack.attackerId];
    if (!attacker) return -Infinity;

    const atkStr = strengthInBattle(state, attack.attackerId);
    const myHp = health(attacker);
    const opp = opponentOf(myPlayerId);

    if (attack.target.kind === 'GUILD') {
      const oppGlory = state.players[opp].glory;
      if (oppGlory <= atkStr) return 1_000_000;
      return 1_000 + atkStr * 10;
    }

    if (attack.target.kind === 'NEUTRAL') {
      const myN = state.board.filter((c) => c.neutralOwner === myPlayerId).length;
      const oppN = state.board.filter((c) => c.neutralOwner === opp).length;
      if (myN >= 4) return 50_000;
      if (oppN >= 4) return 40_000;
      if (myN >= 3) return 5_000;
      if (myN > oppN) return 1_500 + atkStr * 10;
      return 2_000 + atkStr * 10;
    }

    const target = state.cards[attack.target.cardId];
    if (!target) return -Infinity;
    const targetHp = health(target);
    const targetStr = strength(target);
    const shield = target.shieldAvailable;

    const kills = !shield && targetHp > 0 && atkStr >= targetHp;
    const diesInReturn = targetStr >= myHp;

    let score = 100 + atkStr;
    if (kills) score += 800 + targetHp * 10;
    if (diesInReturn) score -= kills ? 100 : 300;
    if (targetHp <= 2 && kills) score += 50;
    return score;
  }

  private pickAdvance(
    actions: readonly Command[],
    myPlayerId: PlayerId,
  ): Command {
    const advance = actions.find((a) => a.type === 'ADVANCE_PHASE');
    if (advance) return advance;
    return { type: 'ADVANCE_PHASE', playerId: myPlayerId };
  }

  private pickEndTurn(
    actions: readonly Command[],
    myPlayerId: PlayerId,
  ): Command {
    const end = actions.find((a) => a.type === 'END_TURN');
    if (end) return end;
    return { type: 'END_TURN', playerId: myPlayerId };
  }
}