import type { CardDefinition } from './schema';
import { KEYWORD_INFO, isFactionTag, type KeywordId } from './abilities';

import stormwindMeta from './data/packs/stormwind/meta.json';
import stormwindCards from './data/packs/stormwind/cards.json';

import voidflameMeta from './data/packs/voidflame/meta.json';
import voidflameCards from './data/packs/voidflame/cards.json';

import apocryphMeta from './data/packs/apocryph/meta.json';
import apocryphCards from './data/packs/apocryph/cards.json';

import steelMeta from './data/packs/steel/meta.json';
import steelCards from './data/packs/steel/cards.json';

import razlomMeta from './data/packs/razlom/meta.json';
import razlomCards from './data/packs/razlom/cards.json';

import echoMeta from './data/packs/echo/meta.json';
import echoCards from './data/packs/echo/cards.json';

import skyMeta from './data/packs/sky/meta.json';
import skyCards from './data/packs/sky/cards.json';

import presetsRaw from './data/presets.json';

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
  cardsById: Record<string, CardDefinition>;
}

const PRESETS = (presetsRaw as DeckPreset[]) ?? [];

function normalizeCard(card: CardDefinition, packId: string): CardDefinition {
  const tags = card.tags ?? [];

  const series = card.series ?? [packId];
  const factions = card.factions ?? tags.filter((t) => isFactionTag(t));
  const roles =
    card.roles ??
    tags.filter(
      (t) =>
        !isFactionTag(t) &&
        !series.includes(t) &&
        t !== 'token' &&
        t !== 'legend',
    );

  const abilityInfo: Record<string, { name?: string; description?: string }> =
    { ...(card.abilityInfo ?? {}) };
  for (const kw of card.abilities ?? []) {
    if (!abilityInfo[kw]) {
      const info = KEYWORD_INFO[kw as KeywordId];
      if (info) {
        abilityInfo[kw] = { name: info.name, description: info.description };
      }
    }
  }

  return { ...card, tags, series, factions, roles, abilityInfo };
}

function buildPack(meta: PackMeta, cardsRaw: unknown): Pack {
  const own = (cardsRaw as CardDefinition[]) ?? [];
  const cards = own.map((c) => normalizeCard(c, meta.id));
  const cardsById = Object.fromEntries(cards.map((c) => [c.id, c]));
  return { meta, cards, cardsById };
}

const PACKS: Record<string, Pack> = {
  stormwind: buildPack(stormwindMeta as PackMeta, stormwindCards),
  voidflame: buildPack(voidflameMeta as PackMeta, voidflameCards),
  apocryph: buildPack(apocryphMeta as PackMeta, apocryphCards),
  steel: buildPack(steelMeta as PackMeta, steelCards),
  razlom: buildPack(razlomMeta as PackMeta, razlomCards),
  echo: buildPack(echoMeta as PackMeta, echoCards),
  sky: buildPack(skyMeta as PackMeta, skyCards),
};

// ─── Legacy-алиасы ───

const LEGACY_AZEROTH_IDS = ['stormwind', 'voidflame', 'apocryph'];
const LEGACY_SVO_IDS = ['steel', 'razlom', 'echo', 'sky'];

function legacyCards(ids: string[]): CardDefinition[] {
  const seen = new Set<string>();
  const out: CardDefinition[] = [];
  for (const id of ids) {
    for (const c of PACKS[id].cards) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(c);
    }
  }
  return out;
}

function legacyPack(
  id: string,
  name: string,
  description: string,
  sourceIds: string[],
): Pack {
  const cards = legacyCards(sourceIds);
  const cardsById = Object.fromEntries(cards.map((c) => [c.id, c]));
  return { meta: { id, name, description, version: '1.0.0' }, cards, cardsById };
}

// ─── Публичный API ───

export function listPacks(): PackMeta[] {
  return Object.values(PACKS).map((p) => p.meta);
}

export function getPack(packId: string): Pack {
  if (PACKS[packId]) return PACKS[packId];

  if (packId === 'azeroth') {
    return legacyPack(
      'azeroth',
      'Азерот (legacy)',
      'Объединение Штормграда, Пламени Пустоты и Апокрифа',
      LEGACY_AZEROTH_IDS,
    );
  }

  if (packId === 'svo') {
    return legacyPack(
      'svo',
      'Современность (legacy)',
      'Объединение Стального Корпуса, Разлома, Эхо-7 и Стратоса',
      LEGACY_SVO_IDS,
    );
  }
  
  if (packId === 'merged') {
    return legacyPack(
      'merged',
      'Слияние (legacy)',
      'Объединение Азерота и Современности — тестовый пак',
      [
        ...LEGACY_AZEROTH_IDS,
        ...LEGACY_SVO_IDS,
      ],
    );
  }

  throw new Error(`Unknown pack: ${packId}`);
}

export function getCards(packId: string): CardDefinition[] {
  return getPack(packId).cards;
}

export function getCardsById(packId: string): Record<string, CardDefinition> {
  return getPack(packId).cardsById;
}

export function getDecks(packId?: string): DeckPreset[] {
  if (!packId) return PRESETS;
  const pack = getPack(packId);
  const cardIds = new Set(pack.cards.map((c) => c.id));
  return PRESETS.filter((d) => d.cards.every((cid) => cardIds.has(cid)));
}

export function listAllDecks(): DeckPreset[] {
  return PRESETS;
}

// ─── Хелперы ───

export function hasSeries(card: CardDefinition, series: string): boolean {
  return card.series?.includes(series) ?? false;
}

export function hasFaction(card: CardDefinition, faction: string): boolean {
  return card.factions?.includes(faction as never) ?? false;
}

export function hasRole(card: CardDefinition, role: string): boolean {
  return card.roles?.includes(role) ?? false;
}

export function getSeriesOf(card: CardDefinition): string[] {
  return card.series ?? [];
}

export function getPrimarySeries(card: CardDefinition): string | null {
  const s = card.series;
  return s && s.length > 0 ? s[0] : null;
}

/**
 * Объединяет cardsById нескольких серий. Позволяет строить одну
 * cardDefinitions-карту для createGame, когда колода использует
 * карты из нескольких серий.
 *
 * При конфликте id — первая серия выигрывает.
 */
export function mergedCardsById(
  series: string[],
): Record<string, CardDefinition> {
  const merged: Record<string, CardDefinition> = {};
  for (const s of series) {
    let pack: Pack;
    try {
      pack = getPack(s);
    } catch {
      continue;
    }
    for (const [id, def] of Object.entries(pack.cardsById)) {
      if (!merged[id]) merged[id] = def;
    }
  }
  return merged;
}

/** Тот же merge, но отдаёт массив без дубликатов. */
export function mergedCards(series: string[]): CardDefinition[] {
  const seen = new Set<string>();
  const out: CardDefinition[] = [];
  for (const s of series) {
    let pack: Pack;
    try {
      pack = getPack(s);
    } catch {
      continue;
    }
    for (const c of pack.cards) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(c);
    }
  }
  return out;
}

/** Все серии, к которым относятся карты колоды. */
export function seriesOfDeck(cardIds: string[]): string[] {
  const result = new Set<string>();
  for (const pack of Object.values(PACKS)) {
    for (const c of pack.cards) {
      if (cardIds.includes(c.id)) {
        for (const s of c.series ?? []) result.add(s);
      }
    }
  }
  return [...result];
}

/** Объединение cardsById всех паков. Для реплеев и подобного. */
export function allCardsById(): Record<string, CardDefinition> {
  const merged: Record<string, CardDefinition> = {};
  for (const pack of Object.values(PACKS)) {
    for (const [id, def] of Object.entries(pack.cardsById)) {
      if (!merged[id]) merged[id] = def;
    }
  }
  return merged;
}


// ─── Legacy-константы ───

export const ALL_CARDS = getPack('stormwind').cards.filter((c) => !c.isToken);
export const ALL_CARDS_WITH_TOKENS = getPack('stormwind').cards;
export const CARDS_BY_ID = getPack('stormwind').cardsById;

export const STORMWIND_ASPECTS = PACKS.stormwind.cards;
export const VOIDFLAME_ASPECTS = PACKS.voidflame.cards;
export const LEGENDARY_ASPECTS = [
  ...PACKS.stormwind.cards,
  ...PACKS.voidflame.cards,
  ...PACKS.apocryph.cards,
].filter((c) => c.rarity === 'legendary');
export const TOKEN_ASPECTS = [
  ...PACKS.stormwind.cards,
  ...PACKS.voidflame.cards,
  ...PACKS.apocryph.cards,
  ...PACKS.steel.cards,
  ...PACKS.razlom.cards,
  ...PACKS.echo.cards,
  ...PACKS.sky.cards,
].filter((c) => c.isToken);