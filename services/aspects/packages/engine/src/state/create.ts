import { CardDefinitionSchema } from '@aspects/cards';
import type { CardDefinition, ResolvedCardDefinition } from '@aspects/cards';
import type { GameState, CardInstance, PlayerState, Column } from '../types/state';
import type { GameEvent } from '../types/events';
import type { CardInstanceId, PlayerId } from '../types/ids';
import { asCardInstanceId, opponentOf } from '../types/ids';
import { hashSeed, mulberry32, shuffle } from '../rng/mulberry';
import { cardAbilities } from './helpers';

export interface CreateGameOptions {
  seed: string;
  decks: Record<PlayerId, string[]>;
  cardDefinitions: Record<string, CardDefinition>;
  startingGlory?: number;
  startingHandSize?: number;
  useMulligan?: boolean;
}

export interface CreateGameResult {
  state: GameState;
  events: GameEvent[];
}

const COLUMN_COUNT = 5;

function emptyColumns(): Column[] {
  return Array.from({ length: COLUMN_COUNT }, () => ({
    p1Front: null,
    p1Reserve: null,
    neutralOwner: null,
    p2Front: null,
    p2Reserve: null,
  }));
}

function createInstances(
  playerId: PlayerId,
  definitionIds: string[],
  definitions: Record<string, CardDefinition>,
  counter: { value: number },
): CardInstance[] {
  return definitionIds.map((defId) => {
    const def = definitions[defId];
    if (!def) throw new Error(`Unknown card definition: ${defId}`);
    counter.value += 1;
    const instanceId = asCardInstanceId(`c${counter.value}`);
    return {
      instanceId,
      definitionId: defId,
      ownerId: playerId,
      controllerId: playerId,
      zone: 'DECK',
      column: null,
      baseHealth: def.health,
      baseStrength: def.strength,
      damageTaken: 0,
      modifiers: [],
      exhausted: false,
      slowCounter: (def.abilities ?? []).includes('slow') ? 1 : 0,
      shieldAvailable: (def.abilities ?? []).includes('shield'),
      turnsOnBoard: 0,
      usedAbilitiesThisTurn: [],
      usedTriggerIdsThisTurn: [],
      attacksThisTurn: 0,
      isToken: def.isToken ?? false,
      sharesIdentity: def.isToken ? (def.sharesIdentity ?? false) : true,
      tempTurnsLeft: def.tempDuration ?? null,
      readyForFront: false,
	  silenced: false,
    };
  });
}

/**
 * Гарантирует, что одна карта с keyword `starter` попадёт в стартовую
 * руку (позиция `handSize - 1` в перемешанной колоде).
 *
 * Если в колоде нет starter'ов — ничего не делает.
 * Если starter'ов несколько — выбирает случайного.
 * Если выбранный уже в стартовой руке — swap всё равно выполняется
 * (состав руки не изменится), но RNG не тратится впустую за зря.
 */
function injectStarter(
  deck: CardInstanceId[],
  handSize: number,
  cards: Record<CardInstanceId, CardInstance>,
  cardDefinitions: Record<string, CardDefinition>,
  rng: () => number,
): void {
  if (handSize <= 0 || deck.length < handSize) return;

  const candidateIdxs: number[] = [];
  for (let i = 0; i < deck.length; i++) {
    const inst = cards[deck[i]];
    if (!inst) continue;
    const def = cardDefinitions[inst.definitionId];
    if (!def) continue;
    if ((def.abilities ?? []).includes('starter')) candidateIdxs.push(i);
  }
  if (candidateIdxs.length === 0) return;

  const targetIdx = handSize - 1;
  const chosenIdx = candidateIdxs[Math.floor(rng() * candidateIdxs.length)];
  if (chosenIdx === targetIdx) return;

  const tmp = deck[targetIdx];
  deck[targetIdx] = deck[chosenIdx];
  deck[chosenIdx] = tmp;
}

export function createGame(opts: CreateGameOptions): CreateGameResult {
  const {
    seed,
    decks,
    cardDefinitions,
    startingGlory = 30,
    startingHandSize = 4,
    useMulligan = false,
  } = opts;

  if (decks.p1.length !== 30 || decks.p2.length !== 30) {
    throw new Error('Each deck must have exactly 30 cards');
  }

  for (const pid of ['p1', 'p2'] as const) {
    const counts = new Map<string, number>();
    for (const defId of decks[pid]) {
      const def = cardDefinitions[defId];
      if (!def) continue;
      if (def.rarity === 'legendary') {
        counts.set(defId, (counts.get(defId) ?? 0) + 1);
      }
    }
    for (const [defId, n] of counts) {
      if (n > 1) {
        throw new Error(
          `Deck ${pid} has ${n} copies of legendary "${defId}", max 1`,
        );
      }
    }
  }

  const rng = mulberry32(hashSeed(seed));
  const events: GameEvent[] = [];

  const counter = { value: 0 };
  const p1Instances = createInstances('p1', decks.p1, cardDefinitions, counter);
  const p2Instances = createInstances('p2', decks.p2, cardDefinitions, counter);

  const allInstances = [...p1Instances, ...p2Instances];
  const cards: Record<CardInstanceId, CardInstance> = {};
  for (const c of allInstances) cards[c.instanceId] = c;

  const p1Deck = shuffle(
    p1Instances.map((c) => c.instanceId),
    rng,
  );
  const p2Deck = shuffle(
    p2Instances.map((c) => c.instanceId),
    rng,
  );

  // Гарантированный стартер в стартовой руке (до Mulligan).
  injectStarter(p1Deck, startingHandSize, cards, cardDefinitions, rng);
  injectStarter(p2Deck, startingHandSize, cards, cardDefinitions, rng);

  const firstPlayer: PlayerId = rng() < 0.5 ? 'p1' : 'p2';
  const secondPlayer = opponentOf(firstPlayer);

  const p1Hand = p1Deck.splice(0, startingHandSize);
  const p2Hand = p2Deck.splice(0, startingHandSize);
  for (const id of p1Hand) cards[id].zone = 'HAND';
  for (const id of p2Hand) cards[id].zone = 'HAND';

  const p1: PlayerState = {
    id: 'p1',
    influence: firstPlayer === 'p1' ? 0 : 1,
    glory: startingGlory,
    deck: p1Deck,
    hand: p1Hand,
    discard: [],
    replacementUsedThisTurn: false,
    cardsPlayedThisTurn: 0,
  };
  const p2: PlayerState = {
    id: 'p2',
    influence: firstPlayer === 'p2' ? 0 : 1,
    glory: startingGlory,
    deck: p2Deck,
    hand: p2Hand,
    discard: [],
    replacementUsedThisTurn: false,
    cardsPlayedThisTurn: 0,
  };

  const usedDefs: Record<string, ResolvedCardDefinition> = {};
  for (const inst of allInstances) {
    if (!usedDefs[inst.definitionId]) {
      usedDefs[inst.definitionId] = CardDefinitionSchema.parse(
        cardDefinitions[inst.definitionId],
      );
    }
  }

  for (const id in cardDefinitions) {
    const def = cardDefinitions[id];
    if (def.isToken && !usedDefs[id]) {
      usedDefs[id] = CardDefinitionSchema.parse(def);
    }
  }

  const state: GameState = {
    definitions: usedDefs,
    cards,
    players: { p1, p2 },
    board: emptyColumns(),
    activePlayer: firstPlayer,
    turnNumber: 1,
    phase: useMulligan ? 'MULLIGAN' : 'RESTORE',
    seed,
    rngState: hashSeed(seed + ':runtime'),
	firstPlayer,
    winner: null,
    winnerReason: null,
    altVictoryPending: { p1: false, p2: false },
    pendingChoice: null,
    pendingTriggers: [],
    instanceCounter: counter.value,
    mulliganDone: useMulligan ? { p1: false, p2: false } : { p1: true, p2: true },
    mulliganReplaced: { p1: 0, p2: 0 },
  };

  events.push({ type: 'GAME_STARTED', seed, firstPlayer });

  if (!useMulligan) {
    events.push({
      type: 'TURN_STARTED',
      playerId: firstPlayer,
      turnNumber: 1,
    });
    events.push({
      type: 'PHASE_CHANGED',
      playerId: firstPlayer,
      phase: 'RESTORE',
    });
  }

  return { state, events };
}