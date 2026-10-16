import type {
  GameState,
  Command,
  CardInstanceId,
  ColumnIndex,
  PlayerId,
} from '@aspects/engine';
import {
  getValidActions,
  health,
  strength,
  strengthInBattle,
  opponentOf,
  previewCardAttack,
  columnBonuses,
  simulateAttackFully,
} from '@aspects/engine';
import type { Effect, TargetSelector } from '@aspects/cards';
import type { Bot } from './types';
import { PROFILES, selectOption, type BehaviorProfile } from './profile';

type PlayCommand = Extract<Command, { type: 'PLAY_CARD' }>;
type AttackCommand = Extract<Command, { type: 'ATTACK' }>;
type ResolveCommand = Extract<Command, { type: 'RESOLVE_CHOICE' }>;
type AbilityCommand = Extract<Command, { type: 'USE_ABILITY' }>;

export interface HeuristicOptions {
  readonly play?: boolean;
  readonly attack?: boolean;
  readonly ability?: boolean;
  readonly smartAbility?: boolean;
  readonly smartDiscard?: boolean;
  readonly column5Penalty?: boolean;
  readonly smartMulligan?: boolean;
  readonly smartReplace?: boolean;
  readonly v4Attack?: boolean;
  readonly v4Triggers?: boolean;
  readonly v4MulliganV2?: boolean;
  readonly v4ReplaceV2?: boolean;
  readonly v5Lookahead?: boolean;
  readonly v5AltVictory?: boolean;
  readonly debug?: boolean;
  readonly profile?: BehaviorProfile;
  readonly temperature?: number;
  readonly mistakeRate?: number;
  readonly mistakeWidth?: number;
  readonly lateGameNeutralFix?: boolean;
}

export class HeuristicBot implements Bot {
  readonly name: string;
  private readonly usePlay: boolean;
  private readonly useAttack: boolean;
  private readonly useAbility: boolean;
  private readonly v2SmartAbility: boolean;
  private readonly v2SmartDiscard: boolean;
  private readonly v2Column5Penalty: boolean;
  private readonly v2SmartMulligan: boolean;
  private readonly v2SmartReplace: boolean;
  private readonly v4Attack: boolean;
  private readonly v4Triggers: boolean;
  private readonly v4MulliganV2: boolean;
  private readonly v4ReplaceV2: boolean;
  private readonly v5Lookahead: boolean;
  private readonly v5AltVictory: boolean;
  private readonly debug: boolean;
  private readonly profile: BehaviorProfile;
  private readonly temperature: number;
  private readonly mistakeRate: number;
  private readonly mistakeWidth: number;
  private readonly lateGameNeutralFix: boolean;

  constructor(name: string = 'HeuristicBot', opts: HeuristicOptions = {}) {
	this.profile = opts.profile ?? PROFILES.balanced;
    this.temperature = opts.temperature ?? 0;
    this.mistakeRate = opts.mistakeRate ?? 0;
    this.name = name;
    this.usePlay = opts.play ?? true;
    this.useAttack = opts.attack ?? true;
    this.useAbility = opts.ability ?? false;
    this.v2SmartAbility = opts.smartAbility ?? false;
    this.v2SmartDiscard = opts.smartDiscard ?? false;
    this.v2Column5Penalty = opts.column5Penalty ?? false;
    this.v2SmartMulligan = opts.smartMulligan ?? false;
    this.v2SmartReplace = opts.smartReplace ?? false;
    this.v4Attack = opts.v4Attack ?? false;
    this.v4Triggers = opts.v4Triggers ?? false;
    this.v4MulliganV2 = opts.v4MulliganV2 ?? false;
    this.v4ReplaceV2 = opts.v4ReplaceV2 ?? false;
    this.v5Lookahead = opts.v5Lookahead ?? false;
    this.v5AltVictory = opts.v5AltVictory ?? false;
    this.debug = opts.debug ?? false;
	this.mistakeWidth = opts.mistakeWidth ?? 3;
	this.lateGameNeutralFix = opts.lateGameNeutralFix ?? false;
  }

  chooseCommand(state: GameState, myPlayerId: PlayerId): Command | null {
    if (state.winner) return null;

    const result = this.chooseCommandInternal(state, myPlayerId);

    if (this.debug && result === null) {
      const weCanAct =
        state.pendingChoice?.playerId === myPlayerId ||
        (state.phase === 'MULLIGAN' && !state.mulliganDone[myPlayerId]) ||
        state.activePlayer === myPlayerId;
      if (weCanAct) {
        const valid = getValidActions(state, myPlayerId);
        if (valid.length > 0) {
          console.warn('[HeuristicBot] returned null with valid actions', {
            phase: state.phase,
            playerId: myPlayerId,
            pendingChoice: state.pendingChoice?.kind ?? null,
            actionTypes: valid.map((a) => a.type),
          });
        }
      }
    }
    return result;
  }

  private chooseCommandInternal(
    state: GameState,
    myPlayerId: PlayerId,
  ): Command | null {
	const seed = String(state.rngState ?? '');
    if (state.pendingChoice) {
      if (state.pendingChoice.playerId !== myPlayerId) return null;
      return this.resolveChoice(state, myPlayerId);
    }

    if (state.phase === 'MULLIGAN') {
      if (state.mulliganDone[myPlayerId]) return null;
      return this.chooseMulligan(state, myPlayerId);
    }

    if (state.activePlayer !== myPlayerId) return null;

    const actions = getValidActions(state, myPlayerId);
    if (actions.length === 0) return null;

    switch (state.phase) {
      case 'PLAY': {
        const play = this.usePlay
          ? this.pickBestPlayAction(state, myPlayerId, actions, seed)
          : this.pickPlayCardGreedy(state, actions);
        if (play) return play;

        if (this.useAbility || this.v2SmartAbility) {
          const ability = this.v2SmartAbility
            ? this.pickSmartAbility(state, actions)
            : this.pickAbility(state, actions);
          if (ability) return ability;
        }
        return this.pickAdvance(actions, myPlayerId);
      }

      case 'COMBAT': {
        const atk = this.useAttack
          ? this.pickAttackHeur(state, myPlayerId, actions, seed)
          : this.pickAttackGreedy(state, myPlayerId, actions);
        if (atk) return atk;

        if (this.useAbility || this.v2SmartAbility) {
          const ability = this.v2SmartAbility
            ? this.pickSmartAbility(state, actions)
            : this.pickAbility(state, actions);
          if (ability) return ability;
        }
        return this.pickEndTurn(actions, myPlayerId);
      }

      default:
        return this.pickAdvance(actions, myPlayerId);
    }
  }


  private chooseMulligan(state: GameState, myPlayerId: PlayerId): Command {
    if (this.v4MulliganV2) return this.smartMulliganV2(state, myPlayerId);
    if (this.v2SmartMulligan) return this.smartMulligan(state, myPlayerId);
    return { type: 'MULLIGAN', playerId: myPlayerId, cardId: null };
  }

  private smartMulligan(state: GameState, myPlayerId: PlayerId): Command {
    const hand = state.players[myPlayerId].hand;
    if (hand.length === 0) {
      return { type: 'MULLIGAN', playerId: myPlayerId, cardId: null };
    }
    let totalCost = 0;
    let worstId: CardInstanceId | null = null;
    let worstCost = -1;
    for (const id of hand) {
      const card = state.cards[id];
      if (!card) continue;
      const def = state.definitions[card.definitionId];
      if (!def) continue;
      totalCost += def.cost;
      if (def.cost > worstCost) {
        worstCost = def.cost;
        worstId = id;
      }
    }
    const avgCost = totalCost / hand.length;
    if (avgCost <= 3.2) {
      return { type: 'MULLIGAN', playerId: myPlayerId, cardId: null };
    }
    if (worstId) {
      return { type: 'MULLIGAN', playerId: myPlayerId, cardId: worstId };
    }
    return { type: 'MULLIGAN', playerId: myPlayerId, cardId: null };
  }

  private smartMulliganV2(state: GameState, myPlayerId: PlayerId): Command {
    const hand = state.players[myPlayerId].hand;
    if (hand.length === 0) {
      return { type: 'MULLIGAN', playerId: myPlayerId, cardId: null };
    }
    let worstId: CardInstanceId | null = null;
    let worstCost = -1;
    for (const id of hand) {
      const card = state.cards[id];
      if (!card) continue;
      const def = state.definitions[card.definitionId];
      if (!def) continue;
      if (def.cost > worstCost) {
        worstCost = def.cost;
        worstId = id;
      }
    }
    if (worstCost >= 6 && worstId) {
      return { type: 'MULLIGAN', playerId: myPlayerId, cardId: worstId };
    }
    return { type: 'MULLIGAN', playerId: myPlayerId, cardId: null };
  }


  private resolveChoice(state: GameState, myPlayerId: PlayerId): Command | null {
    const choice = state.pendingChoice;
    if (!choice) return null;
    if (choice.playerId !== myPlayerId) return null;

    if (choice.kind === 'END_TURN_DISCARD' && this.v2SmartDiscard) {
      return this.pickWorstForDiscard(state, choice, myPlayerId);
    }

    const actions = getValidActions(state, myPlayerId);
    const resolves = actions.filter(
      (a): a is ResolveCommand => a.type === 'RESOLVE_CHOICE',
    );
    if (resolves.length === 0) return null;

    if (choice.kind === 'REPLACE_TARGET_SELECTION') {
      return this.pickReplaceTarget(state, resolves);
    }

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

  private pickReplaceTarget(
    state: GameState,
    resolves: readonly ResolveCommand[],
  ): ResolveCommand {
    let best: ResolveCommand | null = null;
    let bestScore = Infinity;
    for (const r of resolves) {
      if (r.cardIds.length !== 1) continue;
      const id = r.cardIds[0];
      const card = state.cards[id];
      if (!card) continue;
      const def = state.definitions[card.definitionId];
      if (!def) continue;
      const hp = health(card);
      const score = hp * 10 + (def.cost ?? 0) * 5;
      if (score < bestScore) {
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

  private pickWorstForDiscard(
    state: GameState,
    choice: Extract<NonNullable<GameState['pendingChoice']>, { kind: 'END_TURN_DISCARD' }>,
    myPlayerId: PlayerId,
  ): ResolveCommand {
    const ids = choice.eligibleCardIds.slice();
    ids.sort((a, b) => this.cardValue(state, a) - this.cardValue(state, b));
    return {
      type: 'RESOLVE_CHOICE',
      playerId: myPlayerId,
      cardIds: ids.slice(0, choice.count),
    };
  }

  private cardValue(state: GameState, id: CardInstanceId): number {
    const card = state.cards[id];
    if (!card) return -1;
    const def = state.definitions[card.definitionId];
    if (!def) return -1;
    return def.cost * 10 + (def.strength ?? 0) * 8 + (def.health ?? 0) * 4;
  }


  private pickPlayCardGreedy(
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


  private pickBestPlayAction(
    state: GameState,
    myPlayerId: PlayerId,
    actions: readonly Command[],
    seed: string,
  ): Command | null {
    const scored: Array<{ value: Command; score: number }> = [];

    for (const a of actions) {
      if (a.type === 'PLAY_CARD') {
        const card = state.cards[a.cardId];
        if (!card) continue;
        const def = state.definitions[card.definitionId];
        if (!def) continue;

        const abilities = def.abilities ?? [];

        // Стоимость — база. Профиль greediness влияет на вес.
        let score = def.cost * (100 + this.profile.greediness * 50);
        score += (def.strength ?? 0) * 8;
        score += (def.health ?? 0) * 4;

        if (abilities.includes('charge')) {
          score += 30 + (def.strength ?? 0) * 10 * (1 - this.profile.greediness * 0.4);
        }
        if (abilities.includes('taunt')) {
          const myFront = this.countFront(state, myPlayerId);
          const oppFront = this.countFront(state, opponentOf(myPlayerId));
          if (oppFront > myFront) score += 50 + this.profile.defensiveness * 100;
        }
        score += this.scoreColumnForCard(
          state, myPlayerId, a.column, card.definitionId,
        );

        scored.push({ value: a, score });
      } else if (a.type === 'REPLACE_CARD' && this.v2SmartReplace) {
        const s = this.v4ReplaceV2
          ? this.scoreReplaceCardV2(state, myPlayerId, a)
          : this.scoreReplaceCard(state, myPlayerId, a);
        // Профиль replacementLove — сдвиг в пользу замены.
        const profileShift = (this.profile.replacementLove - 0.5) * 200;
        if (Number.isFinite(s)) {
          scored.push({ value: a, score: s + profileShift });
        }
      }
    }

    return selectOption(scored, {
      temperature: this.temperature,
      mistakeRate: this.mistakeRate,
      mistakeWidth: this.mistakeWidth,
      seed,
      salt: 'play',
    });
  }

  private scoreReplaceCard(
    state: GameState,
    myPlayerId: PlayerId,
    cmd: Extract<Command, { type: 'REPLACE_CARD' }>,
  ): number {
    const newCard = state.cards[cmd.cardId];
    if (!newCard) return -Infinity;
    const newDef = state.definitions[newCard.definitionId];
    if (!newDef) return -Infinity;

    const oldId = this.findPersonalityCard(state, myPlayerId, newDef.personalityTag);
    if (!oldId) return -Infinity;
    const oldCard = state.cards[oldId];
    if (!oldCard) return -Infinity;
    const oldDef = state.definitions[oldCard.definitionId];
    if (!oldDef) return -Infinity;

    const dStr = (newDef.strength ?? 0) - (oldDef.strength ?? 0);
    const dHpMax = (newDef.health ?? 0) - (oldDef.health ?? 0);
    const currentHp = health(oldCard);
    const newMaxHp = newDef.health ?? 0;
    const restoredHp = Math.max(0, newMaxHp - currentHp);
    const hpFraction = newMaxHp > 0 ? currentHp / newMaxHp : 0;

    const isWounded = hpFraction < 0.7;
    const isUpgrade = dStr > 0 || dHpMax > 0;
    if (!isWounded && !isUpgrade) return -Infinity;

    const oldLoc = this.findLocation(state, oldId);
    const inFront = oldLoc?.zone === 'FRONT';

    let score = inFront ? 120 : 60;
    score += dStr * 40;
    score += dHpMax * 25;
    score += restoredHp * 30;
    score -= newDef.cost * 30;
    return score;
  }

  private scoreReplaceCardV2(
    state: GameState,
    myPlayerId: PlayerId,
    cmd: Extract<Command, { type: 'REPLACE_CARD' }>,
  ): number {
    const newCard = state.cards[cmd.cardId];
    if (!newCard) return -Infinity;
    const newDef = state.definitions[newCard.definitionId];
    if (!newDef) return -Infinity;

    const oldId = this.findPersonalityCard(state, myPlayerId, newDef.personalityTag);
    if (!oldId) return -Infinity;
    const oldCard = state.cards[oldId];
    if (!oldCard) return -Infinity;
    const oldDef = state.definitions[oldCard.definitionId];
    if (!oldDef) return -Infinity;

    const dStr = (newDef.strength ?? 0) - (oldDef.strength ?? 0);
    const dHpMax = (newDef.health ?? 0) - (oldDef.health ?? 0);
    const currentHp = health(oldCard);
    const newMaxHp = newDef.health ?? 0;
    const restoredHp = Math.max(0, newMaxHp - currentHp);
    const hpFraction = newMaxHp > 0 ? currentHp / newMaxHp : 0;

    const isWounded = hpFraction < 0.7;
    const isUpgrade = dStr > 0 || dHpMax > 0;
    if (!isWounded && !isUpgrade) return -Infinity;

    const oldLoc = this.findLocation(state, oldId);
    const inFront = oldLoc?.zone === 'FRONT';

    let score = 200;
    if (inFront && isWounded) score += 80;
    if (!inFront) score -= 40;
    score += dStr * 50;
    score += dHpMax * 30;
    score += restoredHp * 40;
    score -= newDef.cost * 25;
    return score;
  }

  private findPersonalityCard(
    state: GameState,
    myPlayerId: PlayerId,
    tag: string,
  ): CardInstanceId | null {
    for (const col of state.board) {
      const ids =
        myPlayerId === 'p1'
          ? [col.p1Front, col.p1Reserve]
          : [col.p2Front, col.p2Reserve];
      for (const id of ids) {
        if (!id) continue;
        const card = state.cards[id];
        if (!card) continue;
        const def = state.definitions[card.definitionId];
        if (def?.personalityTag === tag) return id;
      }
    }
    return null;
  }

  private findLocation(
    state: GameState,
    id: CardInstanceId,
  ): { column: ColumnIndex; zone: 'FRONT' | 'RESERVE' } | null {
    for (let i = 0; i < state.board.length; i++) {
      const col = state.board[i];
      const colIdx = (i + 1) as ColumnIndex;
      if (col.p1Front === id || col.p2Front === id) {
        return { column: colIdx, zone: 'FRONT' };
      }
      if (col.p1Reserve === id || col.p2Reserve === id) {
        return { column: colIdx, zone: 'RESERVE' };
      }
    }
    return null;
  }


  private scoreColumnForCard(
    state: GameState,
    myPlayerId: PlayerId,
    column: ColumnIndex,
    definitionId: string,
  ): number {
    const col = state.board[column - 1];
    const opp = opponentOf(myPlayerId);
    const def = state.definitions[definitionId];
    const abilities = def?.abilities ?? [];
    const handSize = state.players[myPlayerId].hand.length;

    const myFrontId = myPlayerId === 'p1' ? col.p1Front : col.p2Front;
    const enemyFrontId = opp === 'p1' ? col.p1Front : col.p2Front;

    let score = 0;

    if (!myFrontId) score += 15;
    else score -= 10;

    if (col.neutralOwner === null) {
      switch (column) {
        case 1:
          score += 15 + Math.min(handSize, 3) * 8;
          break;
        case 4:
          score += 30;
          break;
        case 2:
          score += 25;
          break;
        case 3:
          score += 20;
          break;
        case 5: {
          if (this.v2Column5Penalty) {
            const deckLeft = state.players[myPlayerId].deck.length;
            if (deckLeft < 5) score -= 50;
            else if (deckLeft < 10) score -= 20;
          }
          break;
        }
      }
    } else if (col.neutralOwner === myPlayerId) {
      score += 8;
    } else {
      const oppNeutrals = this.neutralCount(state, opp);
      if (oppNeutrals >= 4) score += 30;
    }

    if (abilities.includes('charge') && !myFrontId) score += 30;
    if (
      abilities.includes('vanguard') &&
      col.neutralOwner === myPlayerId &&
      !myFrontId
    ) {
      score += 30;
    }
    if (abilities.includes('taunt') && enemyFrontId) {
      score += Math.min(strengthInBattle(state, enemyFrontId), 6) * 5;
    }
    if (abilities.includes('scout')) {
      const enemyReserveId = opp === 'p1' ? col.p1Reserve : col.p2Reserve;
      if (enemyReserveId) score += 15;
    }

    return score;
  }

  private countFront(state: GameState, playerId: PlayerId): number {
    let n = 0;
    for (const col of state.board) {
      const id = playerId === 'p1' ? col.p1Front : col.p2Front;
      if (id) n++;
    }
    return n;
  }

  private countReserve(state: GameState, playerId: PlayerId): number {
    let n = 0;
    for (const col of state.board) {
      const id = playerId === 'p1' ? col.p1Reserve : col.p2Reserve;
      if (id) n++;
    }
    return n;
  }

  private neutralCount(state: GameState, playerId: PlayerId): number {
    let n = 0;
    for (const col of state.board) {
      if (col.neutralOwner === playerId) n++;
    }
    return n;
  }


  private pickAbility(
    state: GameState,
    actions: readonly Command[],
  ): AbilityCommand | null {
    let best: AbilityCommand | null = null;
    let bestCost = -1;
    for (const a of actions) {
      if (a.type !== 'USE_ABILITY') continue;
      const card = state.cards[a.cardId];
      if (!card) continue;
      const def = state.definitions[card.definitionId];
      const ability = def?.activatedAbilities?.[a.abilityIndex];
      if (!ability) continue;
      const cost = (ability as { cost?: number }).cost ?? 0;
      if (cost > bestCost) {
        bestCost = cost;
        best = a;
      }
    }
    return best;
  }

  private pickSmartAbility(
    state: GameState,
    actions: readonly Command[],
  ): AbilityCommand | null {
    let best: AbilityCommand | null = null;
    let bestNet = 0;
    for (const a of actions) {
      if (a.type !== 'USE_ABILITY') continue;
      const card = state.cards[a.cardId];
      if (!card) continue;
      const def = state.definitions[card.definitionId];
      const ability = def?.activatedAbilities?.[a.abilityIndex];
      if (!ability) continue;
      const value = this.scoreEffects(
        state, ability.effects, card.ownerId, card.instanceId,
      );
      const net = value - ability.cost * 10;
      if (net > bestNet) {
        bestNet = net;
        best = a;
      }
    }
    return best;
  }


  private scoreEffects(
    state: GameState,
    effects: readonly Effect[],
    myPlayerId: PlayerId,
    sourceCardId?: CardInstanceId,
  ): number {
    let total = 0;
    for (const eff of effects) {
      total += this.scoreOneEffect(state, eff, myPlayerId, sourceCardId);
    }
    return total;
  }

  private scoreOneEffect(
    state: GameState,
    eff: Effect,
    myPlayerId: PlayerId,
    sourceCardId?: CardInstanceId,
  ): number {
    const opp = opponentOf(myPlayerId);
    const oppFront = this.countFront(state, opp);

    switch (eff.kind) {
      case 'DEAL_DAMAGE':
        return this.scoreDealDamage(state, eff, myPlayerId, sourceCardId);
      case 'HEAL':
        return eff.amount * 10;
      case 'BUFF':
        return eff.strength * 8 + eff.health * 4;
      case 'DRAW': {
        if (eff.who === 'SELF') {
          const handSize = state.players[myPlayerId].hand.length;
          if (handSize >= 8) return eff.count * 5;
          return Math.min(eff.count, 3) * 20;
        }
        return 0;
      }
      case 'GAIN_INFLUENCE':
        return eff.who === 'SELF' ? eff.amount * 15 : -eff.amount * 15;
      case 'DAMAGE_GLORY':
        if (eff.who === 'OPPONENT') {
          const oppGlory = state.players[opp].glory;
          const mult = oppGlory <= 5 ? 3 : oppGlory <= 10 ? 1.5 : 1;
          return eff.amount * 80 * mult;
        }
        return 0;
      case 'HEAL_GLORY':
        return eff.who === 'SELF' ? eff.amount * 60 : 0;
      case 'CHOOSE_TARGETS_THEN':
        return this.scoreEffects(state, eff.then, myPlayerId, sourceCardId) * 0.5;
      case 'SUMMON':
        return eff.who === 'SELF' ? eff.count * 100 : 0;
      case 'RETURN_TO_HAND':
        return 30;
      case 'MOVE_CARD':
        return 20;
      case 'RETURN_FROM_DISCARD':
        return eff.who === 'SELF' ? eff.count * 40 : 0;
      case 'DISCARD_RANDOM':
        return eff.who === 'OPPONENT' ? eff.count * 40 : -eff.count * 40;
      default:
        return 0;
    }
  }

  private scoreDealDamage(
    state: GameState,
    eff: Extract<Effect, { kind: 'DEAL_DAMAGE' }>,
    myPlayerId: PlayerId,
    sourceCardId?: CardInstanceId,
  ): number {
    if (eff.target === 'ENEMY_HERO') return eff.amount * 80;

    const targets = this.resolveDamageTargets(
      state, eff.target, myPlayerId, sourceCardId,
    );

    if (targets.length === 0) {
      return eff.amount * 15 * this.selectorMultiplier(eff.target, state, myPlayerId);
    }

    let totalEffective = 0;
    for (const targetId of targets) {
      totalEffective += this.effectiveDamageToCard(state, targetId, eff.amount);
    }
    return totalEffective * 15;
  }

  private effectiveDamageToCard(
    state: GameState,
    targetId: CardInstanceId,
    amount: number,
  ): number {
    const card = state.cards[targetId];
    if (!card) return 0;
    if (card.shieldAvailable) return 0;
    const reduction = columnBonuses(state, card.ownerId).damageReduction;
    return Math.max(0, amount - reduction);
  }

  private resolveDamageTargets(
    state: GameState,
    selector: TargetSelector,
    myPlayerId: PlayerId,
    sourceCardId?: CardInstanceId,
  ): CardInstanceId[] {
    const opp = opponentOf(myPlayerId);
    const result: CardInstanceId[] = [];

    const pushFront = (pid: PlayerId) => {
      for (const col of state.board) {
        const id = pid === 'p1' ? col.p1Front : col.p2Front;
        if (id) result.push(id);
      }
    };
    const pushBoard = (pid: PlayerId) => {
      for (const col of state.board) {
        const f = pid === 'p1' ? col.p1Front : col.p2Front;
        const r = pid === 'p1' ? col.p1Reserve : col.p2Reserve;
        if (f) result.push(f);
        if (r) result.push(r);
      }
    };

    switch (selector) {
      case 'SELF':
        if (sourceCardId) result.push(sourceCardId);
        break;
      case 'OWNER_HERO':
      case 'ENEMY_HERO':
        break;
      case 'ALL_FRIENDLY_FRONT': pushFront(myPlayerId); break;
      case 'ALL_ENEMY_FRONT':    pushFront(opp); break;
      case 'ALL_FRIENDLY_BOARD': pushBoard(myPlayerId); break;
      case 'ALL_ENEMY_BOARD':    pushBoard(opp); break;
      case 'ALL_CARDS_ON_BOARD': {
        pushBoard(myPlayerId);
        pushBoard(opp);
        return result.filter((id) => id !== sourceCardId);
      }
      default:
        break;
    }
    return result;
  }

  private selectorMultiplier(
    selector: TargetSelector,
    state: GameState,
    myPlayerId: PlayerId,
  ): number {
    const opp = opponentOf(myPlayerId);
    const oppFront = this.countFront(state, opp);
    const oppBoard = oppFront + this.countReserve(state, opp);
    switch (selector) {
      case 'RANDOM_ENEMY_FRONT': return Math.min(1, oppFront) * 0.5;
      case 'RANDOM_FRIENDLY_FRONT': return 0.5;
      case 'CHOSEN': return 1;
      case 'ALL_CARDS_ON_BOARD': return oppBoard * 0.5;
      default: return 1;
    }
  }


  private pickAttackGreedy(
    state: GameState,
    myPlayerId: PlayerId,
    actions: readonly Command[],
  ): AttackCommand | null {
    let best: AttackCommand | null = null;
    let bestScore = -Infinity;
    for (const a of actions) {
      if (a.type !== 'ATTACK') continue;
      const score = this.scoreAttackGreedy(state, myPlayerId, a);
      if (score > bestScore) {
        bestScore = score;
        best = a;
      }
    }
    if (bestScore < 0) return null;
    return best;
  }

  private scoreAttackGreedy(
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
      return this.scoreNeutralAttack(state, myPlayerId, attack);
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


  private pickAttackHeur(
    state: GameState,
    myPlayerId: PlayerId,
    actions: readonly Command[],
    seed: string,
  ): AttackCommand | null {
    const attacks = actions.filter(
      (a): a is AttackCommand => a.type === 'ATTACK',
    );
    if (attacks.length === 0) return null;

    if (this.v5Lookahead) {
      return this.pickAttackWithLookahead(state, myPlayerId, attacks);
    }

    const scored = attacks
      .map((a) => ({
        value: a,
        score: this.scoreAttackHeur(state, myPlayerId, a),
      }))
      .filter((s) => s.score >= 0);

    if (scored.length === 0) return null;

    return selectOption(scored, {
      temperature: this.temperature,
      mistakeRate: this.mistakeRate,
      mistakeWidth: this.mistakeWidth,
      seed,
      salt: 'attack',
    });
  }

  private scoreAttackHeur(
    state: GameState,
    myPlayerId: PlayerId,
    attack: AttackCommand,
  ): number {
    const attacker = state.cards[attack.attackerId];
    if (!attacker) return -Infinity;
    const opp = opponentOf(myPlayerId);
    const p = this.profile;

    // ── Гильдия ─────────────────────────────────────────────
    if (attack.target.kind === 'GUILD') {
      const atkStr = strengthInBattle(state, attack.attackerId);
      const oppGlory = state.players[opp].glory;
      if (oppGlory <= atkStr) return 1_000_000;
      let base = 5_000 + atkStr * 20;
      if (this.v4Attack) {
        if (oppGlory <= 10) base = 8_000 + atkStr * 25;
        else if (oppGlory <= 20) base = 6_500 + atkStr * 20;
      }
      // facePressure: 0.7 .. 1.3
      return base * (0.7 + p.facePressure * 0.6);
    }

    // ── Нейтрал ─────────────────────────────────────────────
    if (attack.target.kind === 'NEUTRAL') {
      return this.scoreNeutralAttack(state, myPlayerId, attack);
    }

    // ── Карта ───────────────────────────────────────────────
    const preview = previewCardAttack(
      state, attack.attackerId, attack.target.cardId,
    );
    const target = state.cards[attack.target.cardId];
    if (!preview || !target) return 100;

    const targetDef = state.definitions[target.definitionId];
    const attackerDef = state.definitions[attacker.definitionId];
    const targetCost = targetDef?.cost ?? 0;
    const attackerCost = attackerDef?.cost ?? 0;

    // aggression смягчает вес «убить карту».
    const killBias = 1 - p.aggression * 0.35; // 0.65..1.0
    let score = 0;

    if (preview.defenderDies && !preview.attackerDies) {
      score = (1500 + targetCost * 50) * killBias;
    } else if (preview.defenderDies && preview.attackerDies) {
      score = (500 + (targetCost - attackerCost) * 50) * killBias;
      score -= p.defensiveness * 400;
    } else if (!preview.defenderDies && preview.attackerDies) {
      score = -500 - attackerCost * 50;
      score -= p.defensiveness * 300;
    } else {
      score = 100;
      if (preview.damageToDefender > 0) score += 5;
      score -= preview.damageToAttacker * 8;
      score -= p.defensiveness * preview.damageToAttacker * 4;
      if (preview.damageToDefender === 0 && !preview.shieldBlocks) {
        score -= 150;
      }
      // Агрессоры ценят chip-урон.
      if (p.aggression > 0.5 && preview.damageToDefender > 0) {
        score += (p.aggression - 0.5) * 200;
      }
    }

    if (preview.shieldBlocks && !preview.defenderDies) {
      score -= 250;
    }
    score += preview.overkillToReserve * 15;

    if (this.v4Triggers) {
      score -= this.estimateEnemyTriggers(
        state, attack.target.cardId, myPlayerId,
      );
    }

    return score;
  }
  
  /**
   * Lookahead на 1 полу-ход (delta-версия).
   *
   * Порядок:
   *  1. Считаем heurScore для всех атак.
   *  2. Сортируем и берём топ-3.
   *  3. Для топ-3 делаем simulate, считаем boardPowerDelta, добавляем
   *     малую поправку к heurScore.
   *  4. Возвращаем лучшую.
   *
   * Важно: glory НЕ учитывается в поправке — иначе бот начинает
   * рашить лицо, как в первой версии lookahead.
   */
  private pickAttackWithLookahead(
    state: GameState,
    myPlayerId: PlayerId,
    attacks: readonly AttackCommand[],
  ): AttackCommand | null {
    const scored = attacks.map((a) => ({
      attack: a,
      heurScore: this.scoreAttackHeur(state, myPlayerId, a),
    }));
    scored.sort((a, b) => b.heurScore - a.heurScore);

    const top = scored.slice(0, 3);
    if (top.length === 0) return null;
    if (top.length === 1) return top[0].attack;

    let best = top[0].attack;
    let bestTotal = top[0].heurScore;

    for (const cand of top) {
      const sim = simulateAttackFully(
        state,
        cand.attack.attackerId,
        cand.attack.target,
      );
      if (!sim) continue;
      const delta = this.boardPowerDelta(sim.state, myPlayerId);
      const total = cand.heurScore + delta * 0.5;
      if (total > bestTotal) {
        bestTotal = total;
        best = cand.attack;
      }
    }
    return best;
  }

  /**
   * Простая оценка «силы доски» для lookahead-поправки.
   * Без glory, чтобы не сбивать фокус с разменов.
   */
  private boardPowerDelta(state: GameState, myPlayerId: PlayerId): number {
    const opp = opponentOf(myPlayerId);
    let myPower = 0;
    let oppPower = 0;
    for (const col of state.board) {
      const myF = myPlayerId === 'p1' ? col.p1Front : col.p2Front;
      const myR = myPlayerId === 'p1' ? col.p1Reserve : col.p2Reserve;
      const opF = opp === 'p1' ? col.p1Front : col.p2Front;
      const opR = opp === 'p1' ? col.p1Reserve : col.p2Reserve;

      if (myF) {
        const c = state.cards[myF];
        if (c) myPower += strengthInBattle(state, myF) + health(c);
      }
      if (myR) {
        const c = state.cards[myR];
        if (c) myPower += (strength(c) + health(c)) * 0.5;
      }
      if (opF) {
        const c = state.cards[opF];
        if (c) oppPower += strengthInBattle(state, opF) + health(c);
      }
      if (opR) {
        const c = state.cards[opR];
        if (c) oppPower += (strength(c) + health(c)) * 0.5;
      }
    }
    return myPower - oppPower;
  }

  /**
   * Оценка позиции после гипотетической атаки. Простая, дешёвая,
   * без рекурсии. Ключевые факторы — glory, сила на доске, нейтралы.
   */
  private evaluatePosition(state: GameState, myPlayerId: PlayerId): number {
    const opp = opponentOf(myPlayerId);

    let score = 0;

    score += (state.players[myPlayerId].glory - state.players[opp].glory) * 100;

    let myPower = 0;
    let oppPower = 0;
    for (const col of state.board) {
      const myF = myPlayerId === 'p1' ? col.p1Front : col.p2Front;
      const myR = myPlayerId === 'p1' ? col.p1Reserve : col.p2Reserve;
      const opF = opp === 'p1' ? col.p1Front : col.p2Front;
      const opR = opp === 'p1' ? col.p1Reserve : col.p2Reserve;

      if (myF) {
        const c = state.cards[myF];
        if (c) myPower += strengthInBattle(state, myF) + health(c);
      }
      if (myR) {
        const c = state.cards[myR];
        if (c) myPower += (strength(c) + health(c)) * 0.5;
      }
      if (opF) {
        const c = state.cards[opF];
        if (c) oppPower += strengthInBattle(state, opF) + health(c);
      }
      if (opR) {
        const c = state.cards[opR];
        if (c) oppPower += (strength(c) + health(c)) * 0.5;
      }
    }
    score += (myPower - oppPower) * 10;

    const myN = this.neutralCount(state, myPlayerId);
    const oppN = this.neutralCount(state, opp);
    score += (myN - oppN) * 200;
    if (myN === 5) score += 10_000;
    if (oppN === 5) score -= 10_000;

    return score;
  }

  private estimateEnemyTriggers(
    state: GameState,
    targetId: CardInstanceId,
    myPlayerId: PlayerId,
  ): number {
    const target = state.cards[targetId];
    if (!target) return 0;
    const targetDef = state.definitions[target.definitionId];
    let penalty = 0;

    for (const tr of targetDef?.triggers ?? []) {
      if (tr.trigger === 'ON_THIS_DAMAGED' || tr.trigger === 'ON_EXIT') {
        penalty += this.scoreEnemyEffect(state, tr.effects, myPlayerId);
      }
    }

    const ownerId = target.ownerId;
    for (const col of state.board) {
      const ids =
        ownerId === 'p1'
          ? [col.p1Front, col.p1Reserve]
          : [col.p2Front, col.p2Reserve];
      for (const id of ids) {
        if (!id || id === targetId) continue;
        const c = state.cards[id];
        if (!c) continue;
        const d = state.definitions[c.definitionId];
        for (const tr of d?.triggers ?? []) {
          if (tr.trigger === 'ON_ALLY_DIED') {
            penalty += this.scoreEnemyEffect(state, tr.effects, myPlayerId);
          }
        }
      }
    }
    return penalty;
  }

  private scoreEnemyEffect(
    state: GameState,
    effects: readonly Effect[],
    myPlayerId: PlayerId,
  ): number {
    let penalty = 0;
    for (const eff of effects) {
      switch (eff.kind) {
        case 'DEAL_DAMAGE':
          if (
            eff.target === 'ALL_ENEMY_FRONT' ||
            eff.target === 'ALL_ENEMY_BOARD' ||
            eff.target === 'ENEMY_HERO' ||
            eff.target === 'RANDOM_ENEMY_FRONT' ||
            eff.target === 'CHOSEN'
          ) {
            penalty += eff.amount * 20;
          }
          break;
        case 'BUFF':
          penalty += eff.strength * 8 + eff.health * 4;
          break;
        case 'DRAW':
          if (eff.who === 'OPPONENT') penalty += eff.count * 15;
          break;
        case 'HEAL_GLORY':
          if (eff.who === 'OPPONENT') penalty += eff.amount * 50;
          break;
        case 'SUMMON':
          if (eff.who === 'OPPONENT') penalty += eff.count * 100;
          break;
        case 'DISCARD_RANDOM':
          if (eff.who === 'SELF') penalty += eff.count * 30;
          break;
        default:
          break;
      }
    }
    return penalty;
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

  private findNeutralDefender(
    state: GameState,
    column: ColumnIndex,
    defenderId: PlayerId,
  ): CardInstanceId | null {
    const col = state.board[column - 1];
    if (!col) return null;
    const frontId =
      defenderId === 'p1' ? col.p1Front : col.p2Front;
    if (!frontId) return null;
    const card = state.cards[frontId];
    if (!card || card.exhausted) return null;
    return frontId;
  }

  /**
   * Атака по нейтралу. Разветвляется по флагу lateGameNeutralFix:
   *  - false → старое поведение (агрессивные константы 50k/40k/5k, без
   *    учёта защитника).
   *  - true  → новое: учитываем защитника, снижаем приоритет нейтрала
   *    ниже карточного kill, в лейтгейме (пустая колода) игнорируем
   *    бесполезные колонки 1/3/5.
   */
  private scoreNeutralAttack(
    state: GameState,
    myPlayerId: PlayerId,
    attack: AttackCommand,
  ): number {
	if (attack.target.kind !== 'NEUTRAL') return 0;
    const opp = opponentOf(myPlayerId);
    const myN = this.neutralCount(state, myPlayerId);
    const oppN = this.neutralCount(state, opp);
    const atkStr = strengthInBattle(state, attack.attackerId);
    const column = attack.target.column;

    if (this.v5AltVictory) {
      const pending = state.altVictoryPending;
      if (pending?.[opp] && oppN >= 4) return 600_000;
      if (pending?.[myPlayerId] && myN >= 4) return 500_000;
    }

    if (!this.lateGameNeutralFix) {
      if (myN >= 4) return 50_000;
      if (oppN >= 4) return 40_000;
      if (this.v4Attack && myN >= 3) return 7_000 + atkStr * 15;
      if (myN >= 3) return 5_000;
      if (myN > oppN) return 1_500 + atkStr * 10;
      return 2_000 + atkStr * 10;
    }

    const defender = this.findNeutralDefender(state, column, opp);
    let canCapture = true;
    if (defender) {
      const pv = previewCardAttack(state, attack.attackerId, defender);
      if (!pv || !(pv.defenderDies && !pv.attackerDies)) canCapture = false;
    }

    if (!canCapture && defender) {
      const pv = previewCardAttack(state, attack.attackerId, defender);
      if (pv) {
        if (pv.defenderDies && !pv.attackerDies) return 800;
        if (pv.defenderDies && pv.attackerDies) return 300;
        if (pv.attackerDies) return -400;
      }
      return 100;
    }

    const deckLeft = state.players[myPlayerId].deck.length;
    if (deckLeft === 0) {
      if (column === 1 || column === 3 || column === 5) return 50;
      return 1_000 + atkStr * 10;
    }

    if (myN >= 4) return 1_400 + atkStr * 10;
    if (oppN >= 4) return 1_200 + atkStr * 10;
    if (myN >= 3) return 1_100 + atkStr * 10;
    if (myN > oppN) return 900 + atkStr * 10;
    return 1_000 + atkStr * 10;
  }
}