import type { WritableDraft } from 'immer';
import type { GameState, CardInstance } from '../types/state';
import type { ResolutionContext } from '../types/resolution';
import type { CardInstanceId, ColumnIndex, PlayerId } from '../types/ids';
import { asCardInstanceId } from '../types/ids';
import { randomIndex } from './rng';

export type SummonDestination = 'FRONT' | 'RESERVE' | 'HAND';

export function summonToken(
  draft: WritableDraft<GameState>,
  defId: string,
  ownerId: PlayerId,
  ctx: ResolutionContext,
  destination: SummonDestination = 'FRONT',
): CardInstanceId | null {
  const def = draft.definitions[defId];
  if (!def) {
    ctx.events.push({ type: 'TOKEN_LOST', defId, ownerId, reason: 'unknown_definition' });
    return null;
  }

  // Токены при призыве не конфликтуют по Личности — ни с обычными картами,
  // ни между собой. Правило «одна Личность» применяется только при розыгрыше
  // карты из руки и при замене.

  draft.instanceCounter += 1;
  const instanceId = asCardInstanceId(`t${draft.instanceCounter}`);

  if (destination === 'HAND') {
    const card: CardInstance = {
      instanceId,
      definitionId: defId,
      ownerId,
      controllerId: ownerId,
      zone: 'HAND',
      column: null,
      baseHealth: def.health,
      baseStrength: def.strength,
      damageTaken: 0,
      modifiers: [],
      exhausted: false,
      slowCounter: def.abilities.includes('slow') ? 1 : 0,
      shieldAvailable: def.abilities.includes('shield'),
      turnsOnBoard: 0,
      usedAbilitiesThisTurn: [],
      usedTriggerIdsThisTurn: [],
      isToken: true,
      sharesIdentity: def.sharesIdentity ?? false,
      tempTurnsLeft: def.tempDuration ?? null,
      readyForFront: false,
    };
    draft.cards[instanceId] = card;
    draft.players[ownerId].hand.push(instanceId);

    ctx.events.push({
      type: 'TOKEN_SUMMONED',
      cardId: instanceId,
      defId,
      ownerId,
      destination: 'HAND',
      column: null,
    });
    return instanceId;
  }

  const slot = findFreeSlot(draft, ownerId, destination);
  if (!slot) {
    ctx.events.push({
      type: 'TOKEN_LOST',
      defId,
      ownerId,
      reason: 'no_free_slot',
    });
    return null;
  }

  const card: CardInstance = {
    instanceId,
    definitionId: defId,
    ownerId,
    controllerId: ownerId,
    zone: slot.zone,
    column: slot.column,
    baseHealth: def.health,
    baseStrength: def.strength,
    damageTaken: 0,
    modifiers: [],
    exhausted: false,
    slowCounter: def.abilities.includes('slow') ? 1 : 0,
    shieldAvailable: def.abilities.includes('shield'),
    turnsOnBoard: 0,
    usedAbilitiesThisTurn: [],
    usedTriggerIdsThisTurn: [],
    isToken: true,
    sharesIdentity: def.sharesIdentity ?? false,
    tempTurnsLeft: def.tempDuration ?? null,
    readyForFront: false,
  };

  draft.cards[instanceId] = card;

  const col = draft.board[slot.column - 1];
  if (slot.zone === 'FRONT') {
    if (ownerId === 'p1') col.p1Front = instanceId;
    else col.p2Front = instanceId;
  } else {
    if (ownerId === 'p1') col.p1Reserve = instanceId;
    else col.p2Reserve = instanceId;
  }

  ctx.events.push({
    type: 'TOKEN_SUMMONED',
    cardId: instanceId,
    defId,
    ownerId,
    destination: slot.zone,
    column: slot.column,
  });

  return instanceId;
}

function findFreeSlot(
  draft: WritableDraft<GameState>,
  ownerId: PlayerId,
  destination: SummonDestination,
): { zone: 'FRONT' | 'RESERVE'; column: ColumnIndex } | null {
  if (destination === 'FRONT') {
    const frontCols: ColumnIndex[] = [];
    for (let i = 1; i <= 5; i++) {
      const col = draft.board[i - 1];
      const frontId = ownerId === 'p1' ? col.p1Front : col.p2Front;
      if (frontId === null) frontCols.push(i as ColumnIndex);
    }
    if (frontCols.length > 0) {
      const column = frontCols[randomIndex(draft, frontCols.length)];
      return { zone: 'FRONT', column };
    }

    const reserveCols: ColumnIndex[] = [];
    for (let i = 1; i <= 5; i++) {
      const col = draft.board[i - 1];
      const reserveId = ownerId === 'p1' ? col.p1Reserve : col.p2Reserve;
      if (reserveId === null) reserveCols.push(i as ColumnIndex);
    }
    if (reserveCols.length > 0) {
      const column = reserveCols[randomIndex(draft, reserveCols.length)];
      return { zone: 'RESERVE', column };
    }
    return null;
  }

  const reserveCols: ColumnIndex[] = [];
  for (let i = 1; i <= 5; i++) {
    const col = draft.board[i - 1];
    const reserveId = ownerId === 'p1' ? col.p1Reserve : col.p2Reserve;
    if (reserveId === null) reserveCols.push(i as ColumnIndex);
  }
  if (reserveCols.length > 0) {
    const column = reserveCols[randomIndex(draft, reserveCols.length)];
    return { zone: 'RESERVE', column };
  }
  return null;
}