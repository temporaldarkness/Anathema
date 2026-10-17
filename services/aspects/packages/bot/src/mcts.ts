import {
  applyCommand,
  getValidActions,
  opponentOf,
} from '@aspects/engine';
import type { GameState, Command, PlayerId } from '@aspects/engine';
import { makeRng, type Rng } from './rng';
import type { Bot } from './types';

export interface MctsOptions {
  readonly budgetMs?: number;
  readonly maxIterations?: number;
  readonly rolloutDepth?: number;
  readonly c?: number;
  readonly name?: string;
}

interface MctsNode {
  readonly state: GameState;
  readonly toMove: PlayerId | null;
  readonly isMaximizing: boolean;
  readonly parent: MctsNode | null;
  readonly actionFromParent: Command | null;
  readonly children: MctsNode[];
  readonly untriedActions: Command[];
  visits: number;
  rewardSum: number;
}

const DEFAULTS = {
  budgetMs: 500,
  maxIterations: 400,
  rolloutDepth: 12,
  c: Math.SQRT2,
};

/**
 * UCT-MCTS для двух игроков.
 *
 * Reward всегда с точки зрения root-игрока (того, за кого решаем).
 * На selection переворачиваем знак для узлов, где ход оппонента.
 *
 * Детерминирован: RNG инициализируется от state.rngState + salt.
 * При одинаковом state + budgetMs даёт одинаковый ход.
 */
export class MctsBot implements Bot {
  readonly name: string;
  private readonly budgetMs: number;
  private readonly maxIterations: number;
  private readonly rolloutDepth: number;
  private readonly c: number;

  constructor(opts: MctsOptions = {}) {
    this.name = opts.name ?? 'MctsBot';
    this.budgetMs = opts.budgetMs ?? DEFAULTS.budgetMs;
    this.maxIterations = opts.maxIterations ?? DEFAULTS.maxIterations;
    this.rolloutDepth = opts.rolloutDepth ?? DEFAULTS.rolloutDepth;
    this.c = opts.c ?? DEFAULTS.c;
  }

  chooseCommand(state: GameState, myPlayerId: PlayerId): Command | null {
    if (state.winner) return null;

    // Быстрые случаи: не тратим MCTS на тривиальное.
    if (state.pendingChoice) {
      if (state.pendingChoice.playerId !== myPlayerId) return null;
    } else if (state.phase === 'MULLIGAN') {
      if (state.mulliganDone[myPlayerId]) return null;
      // Mulligan — не место для MCTS, всегда keep.
      return { type: 'MULLIGAN', playerId: myPlayerId, cardId: null };
    } else if (state.activePlayer !== myPlayerId) {
      return null;
    }

    const valid = getValidActions(state, myPlayerId);
    if (valid.length === 0) return null;
    if (valid.length === 1) return valid[0];

    const root = this.makeRoot(state, myPlayerId);
    const rng = makeRng(`${state.rngState ?? ''}|mcts|${myPlayerId}`);
    const deadline = Date.now() + this.budgetMs;

    let iterations = 0;
    while (iterations < this.maxIterations && Date.now() < deadline) {
      this.iterate(root, myPlayerId, rng);
      iterations++;
    }

    if (root.children.length === 0) return valid[0];

    // Финальный выбор — по visits (robust child).
    let best = root.children[0];
    for (const c of root.children) {
      if (c.visits > best.visits) best = c;
    }
    return best.actionFromParent ?? valid[0];
  }

  private makeRoot(state: GameState, myPlayerId: PlayerId): MctsNode {
    const toMove = this.whoToMove(state);
    return {
      state,
      toMove,
      isMaximizing: toMove === myPlayerId,
      parent: null,
      actionFromParent: null,
      children: [],
      untriedActions: toMove ? getValidActions(state, toMove) : [],
      visits: 0,
      rewardSum: 0,
    };
  }

  private whoToMove(state: GameState): PlayerId | null {
    if (state.winner) return null;
    if (state.pendingChoice) return state.pendingChoice.playerId;
    if (state.phase === 'MULLIGAN') {
      if (!state.mulliganDone['p1']) return 'p1';
      if (!state.mulliganDone['p2']) return 'p2';
      return null;
    }
    return state.activePlayer;
  }

  private iterate(root: MctsNode, rootPlayer: PlayerId, rng: Rng): void {
    // 1. Selection — спускаемся, пока есть раскрытые дети.
    let node = root;
    while (node.untriedActions.length === 0 && node.children.length > 0) {
      node = this.selectChild(node);
    }

    // 2. Expansion — раскрываем одну непроверенную ветку.
    if (node.untriedActions.length > 0 && !node.state.winner) {
      const idx = rng.int(node.untriedActions.length);
      const action = node.untriedActions.splice(idx, 1)[0];
      const r = applyCommand(node.state, action);
      const rejected = r.events.some(
        (e) => (e as { type?: string }).type === 'COMMAND_REJECTED',
      );
      if (!rejected) {
        const toMove = this.whoToMove(r.state);
        const child: MctsNode = {
          state: r.state,
          toMove,
          isMaximizing: toMove === rootPlayer,
          parent: node,
          actionFromParent: action,
          children: [],
          untriedActions: toMove ? getValidActions(r.state, toMove) : [],
          visits: 0,
          rewardSum: 0,
        };
        node.children.push(child);
        node = child;
      }
    }

    // 3. Rollout.
    const reward = this.rollout(node.state, rootPlayer, rng);

    // 4. Backprop.
    let n: MctsNode | null = node;
    while (n !== null) {
      n.visits++;
      n.rewardSum += reward;
      n = n.parent;
    }
  }

  private selectChild(node: MctsNode): MctsNode {
    let best: MctsNode | null = null;
    let bestUcb = -Infinity;
    const logParent = Math.log(Math.max(2, node.visits));
    for (const child of node.children) {
      if (child.visits === 0) return child; // приоритет непосещённым
      const mean = child.rewardSum / child.visits;
      const exploit = node.isMaximizing ? mean : -mean;
      const explore = this.c * Math.sqrt(logParent / child.visits);
      const ucb = exploit + explore;
      if (ucb > bestUcb) {
        bestUcb = ucb;
        best = child;
      }
    }
    return best ?? node.children[0];
  }

  private rollout(state: GameState, rootPlayer: PlayerId, rng: Rng): number {
    let s = state;
    let depth = 0;
    while (!s.winner && depth < this.rolloutDepth) {
      const p = this.whoToMove(s);
      if (p === null) break;
      const actions = getValidActions(s, p);
      if (actions.length === 0) break;
      const action = actions[rng.int(actions.length)];
      const r = applyCommand(s, action);
      if (r.events.some((e) => (e as { type?: string }).type === 'COMMAND_REJECTED')) {
        break;
      }
      s = r.state;
      depth++;
    }
    return this.evaluate(s, rootPlayer);
  }

  /**
   * Оценка листовой позиции с точки зрения rootPlayer.
   * Возврат в [0, 1]: 0 = проиграли, 1 = победили.
   */
  private evaluate(state: GameState, rootPlayer: PlayerId): number {
    if (state.winner) {
      return state.winner === rootPlayer ? 1 : 0;
    }
    const opp = opponentOf(rootPlayer);
    const myGlory = state.players[rootPlayer].glory;
    const oppGlory = state.players[opp].glory;
  
    // Alt-victory (new rules): 5/5 = instant win.
    let myN = 0;
    let oppN = 0;
    for (const col of state.board) {
      if (col.neutralOwner === rootPlayer) myN++;
      else if (col.neutralOwner === opp) oppN++;
    }
    if (myN === 5) return 1;
    if (oppN === 5) return 0;
  
    // Glory component: [-60, +60] → [0, 1].
    let score = 0.5 + (myGlory - oppGlory) / 60;
  
    // Neutral: 4/5 is nearly a win — swing terminal evaluation.
    if (myN === 4) score += 0.35;
    if (oppN === 4) score -= 0.35;
    score += (myN - oppN) * 0.03;
  
    return Math.max(0, Math.min(1, score));
  }
}