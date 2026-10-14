import type { CardDefinition } from './schema';

import azerothMeta from './data/packs/azeroth/meta.json';
import azerothCardsRaw from './data/packs/azeroth/cards.json';
import azerothDecksRaw from './data/packs/azeroth/decks.json';

import svoMeta from './data/packs/svo/meta.json';
import svoCardsRaw from './data/packs/svo/cards.json';
import svoDecksRaw from './data/packs/svo/decks.json';

import mergedMeta from './data/packs/merged/meta.json';
import mergedCardsRaw from './data/packs/merged/cards.json';
import mergedDecksRaw from './data/packs/merged/decks.json';

export interface PackMeta {
  id: string;
  name: string;
  description: string;
  version: string;
}

export interface DeckPreset {
  id: string;
  name: string;
  description: string;
  cards: string[];
}

export interface Pack {
  meta: PackMeta;
  cards: CardDefinition[];
  archetype?: 'aggro' | 'midrange' | 'control' | 'combo';
  expectedWinrate?: number;
  cardsById: Record<string, CardDefinition>;
  decks: DeckPreset[];
}

function buildPack(
  meta: PackMeta,
  cardsRaw: unknown,
  decksRaw: unknown,
): Pack {
  const cards = cardsRaw as CardDefinition[];
  const decks = (Array.isArray(decksRaw) ? decksRaw : []) as DeckPreset[];
  const cardsById = Object.fromEntries(cards.map((c) => [c.id, c]));
  return { meta, cards, cardsById, decks };
}

const PACKS: Record<string, Pack> = {
  azeroth: buildPack(azerothMeta as PackMeta, azerothCardsRaw, azerothDecksRaw),
  svo: buildPack(svoMeta as PackMeta, svoCardsRaw, svoDecksRaw),
  merged: buildPack(mergedMeta as PackMeta, mergedCardsRaw, mergedDecksRaw),
};

export function listPacks(): PackMeta[] {
  return Object.values(PACKS).map((p) => p.meta);
}

export function getPack(packId: string): Pack {
  const p = PACKS[packId];
  if (!p) {
    throw new Error(`Unknown pack: ${packId}`);
  }
  return p;
}

export function getCards(packId: string): CardDefinition[] {
  return getPack(packId).cards;
}

export function getCardsById(packId: string): Record<string, CardDefinition> {
  return getPack(packId).cardsById;
}

export function getDecks(packId: string): DeckPreset[] {
  return getPack(packId).decks;
}

const DEFAULT_PACK = 'azeroth';

export const STORMWIND_ASPECTS = getPack('azeroth').cards.filter((c) =>
  c.tags?.includes('stormwind'),
);
export const VOIDFLAME_ASPECTS = getPack('azeroth').cards.filter((c) =>
  c.tags?.includes('voidflame'),
);
export const LEGENDARY_ASPECTS = getPack('azeroth').cards.filter(
  (c) => c.rarity === 'legendary',
);
export const TOKEN_ASPECTS = getPack('azeroth').cards.filter((c) => c.isToken);
export const ALL_CARDS = getPack(DEFAULT_PACK).cards.filter((c) => !c.isToken);
export const ALL_CARDS_WITH_TOKENS = getPack(DEFAULT_PACK).cards;
export const CARDS_BY_ID = getPack(DEFAULT_PACK).cardsById;