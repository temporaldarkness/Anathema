import type { CardDefinition } from './schema';
import { KEYWORD_INFO, isFactionTag, type KeywordId } from './abilities';

import { PACKS_RAW } from './data/packs-index.generated';

import activeSeriesRaw from './data/active-series.json';
import presetsRaw from './data/presets.json';
import personalitiesRaw from './data/personalities.json';
import factionsRaw from './data/factions.json';
import rolesRaw from './data/roles.json';

const PERSONALITIES = personalitiesRaw as Record<string, string>;
const FACTIONS = factionsRaw as Record<string, { name: string; color: string }>;
const ROLES = rolesRaw as Record<string, { name: string; icon: string }>;

export interface PackMeta {
  id: string;
  name: string;
  description: string;
  loreHook?: string;
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

const PACKS: Record<string, Pack> = {};
for (const raw of PACKS_RAW) {
  const meta = raw.meta as PackMeta;
  PACKS[meta.id] = buildPack(meta, raw.cards);
}


interface ActiveSeriesFile {
  active?: string[];
}

const ACTIVE_FILE = activeSeriesRaw as ActiveSeriesFile;
const ACTIVE_SERIES: Set<string> =
  ACTIVE_FILE.active && ACTIVE_FILE.active.length > 0
    ? new Set(ACTIVE_FILE.active)
    : new Set(Object.keys(PACKS));

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
  return Object.values(PACKS)
    .filter((p) => ACTIVE_SERIES.has(p.meta.id))
    .map((p) => p.meta);
}

export function listAllPacks(): PackMeta[] {
  return Object.values(PACKS).map((p) => p.meta);
}

export function isSeriesActive(id: string): boolean {
  return ACTIVE_SERIES.has(id);
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

export function decksForSeries(series: string[]): DeckPreset[] {
  const cardIds = new Set<string>();
  for (const s of series) {
    let pack: Pack;
    try {
      pack = getPack(s);
    } catch {
      continue;
    }
    for (const c of pack.cards) cardIds.add(c.id);
  }
  if (cardIds.size === 0) return [];
  return PRESETS.filter((d) => d.cards.every((cid) => cardIds.has(cid)));
}

export function listActiveDecks(): DeckPreset[] {
  return PRESETS.filter((d) => {
    const series = seriesOfDeck(d.cards);
    return series.length > 0 && series.every((s) => ACTIVE_SERIES.has(s));
  });
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

export function getPersonalityName(id: string): string {
  return PERSONALITIES[id] ?? id;
}

export function getSeriesName(id: string): string {
  return PACKS[id]?.meta.name ?? id;
}

export function getFactionInfo(id: string): { name: string; color: string } {
  return FACTIONS[id] ?? { name: id, color: '#6b7280' };
}

export function getRoleInfo(id: string): { name: string; icon: string } {
  return ROLES[id] ?? { name: id, icon: '•' };
}