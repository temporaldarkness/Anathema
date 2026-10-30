import type { CardDefinition } from './schema';
import { KEYWORD_INFO, isFactionTag, type KeywordId } from './abilities';
import { SCOPES, type ScopeMeta } from './scopes';

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

// ═══════════════════════════════════════════════════════
//   ПУБЛИЧНЫЙ API — СЕРИИ
// ═══════════════════════════════════════════════════════

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

export function hasSeriesId(id: string): boolean {
  return !!PACKS[id];
}

export function getPack(seriesId: string): Pack {
  const pack = PACKS[seriesId];
  if (!pack) {
    throw new Error(
      `Unknown series: "${seriesId}". Known: ${Object.keys(PACKS).join(', ')}`,
    );
  }
  return pack;
}

export function getCards(seriesId: string): CardDefinition[] {
  return getPack(seriesId).cards;
}

export function getCardsById(seriesId: string): Record<string, CardDefinition> {
  return getPack(seriesId).cardsById;
}

// ═══════════════════════════════════════════════════════
//   ПУБЛИЧНЫЙ API — SCOPE
// ═══════════════════════════════════════════════════════

export function listScopes(): ScopeMeta[] {
  return Object.values(SCOPES);
}

export function getScopeMeta(scopeId: string): ScopeMeta | null {
  return SCOPES[scopeId] ?? null;
}

export function resolveScope(scope: string | string[]): string[] {
  if (Array.isArray(scope)) return scope.filter((s) => !!PACKS[s]);
  if (SCOPES[scope]) return [...SCOPES[scope].series];
  if (scope.includes(',')) {
    return scope
      .split(',')
      .map((s) => s.trim())
      .filter((s) => !!PACKS[s]);
  }
  if (PACKS[scope]) return [scope];
  return [];
}

export function scopeOfSeries(seriesId: string): string | null {
  for (const scope of Object.values(SCOPES)) {
    if (scope.series.includes(seriesId)) return scope.id;
  }
  return null;
}

export function scopeOfDeck(cardIds: string[]): string | null {
  const series = seriesOfDeck(cardIds);
  if (series.length === 0) return null;
  let found: string | null = null;
  for (const s of series) {
    const sc = scopeOfSeries(s);
    if (!sc) return null;
    if (found === null) found = sc;
    else if (found !== sc) return null;
  }
  return found;
}

export function cardsForScope(
  scope: string | string[],
): Record<string, CardDefinition> {
  return mergedCardsById(resolveScope(scope));
}

export function decksForScope(scope: string | string[]): DeckPreset[] {
  return decksForSeries(resolveScope(scope));
}

// ═══════════════════════════════════════════════════════
//   ПУБЛИЧНЫЙ API — ПРЕСЕТЫ
// ═══════════════════════════════════════════════════════

export function getDecks(seriesId?: string): DeckPreset[] {
  if (!seriesId) return PRESETS;
  const pack = getPack(seriesId);
  const cardIds = new Set(pack.cards.map((c) => c.id));
  return PRESETS.filter((d) => d.cards.every((cid) => cardIds.has(cid)));
}

export function decksForSeries(series: string[]): DeckPreset[] {
  const cardIds = new Set<string>();
  for (const s of series) {
    const pack = PACKS[s];
    if (!pack) continue;
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

// ═══════════════════════════════════════════════════════
//   ХЕЛПЕРЫ КАРТ
// ═══════════════════════════════════════════════════════

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

export function mergedCardsById(
  series: string[],
): Record<string, CardDefinition> {
  const merged: Record<string, CardDefinition> = {};
  for (const s of series) {
    const pack = PACKS[s];
    if (!pack) continue;
    for (const [id, def] of Object.entries(pack.cardsById)) {
      if (!merged[id]) merged[id] = def;
    }
  }
  return merged;
}

export function mergedCards(series: string[]): CardDefinition[] {
  const seen = new Set<string>();
  const out: CardDefinition[] = [];
  for (const s of series) {
    const pack = PACKS[s];
    if (!pack) continue;
    for (const c of pack.cards) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(c);
    }
  }
  return out;
}

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

export function allCardsById(): Record<string, CardDefinition> {
  const merged: Record<string, CardDefinition> = {};
  for (const pack of Object.values(PACKS)) {
    for (const [id, def] of Object.entries(pack.cardsById)) {
      if (!merged[id]) merged[id] = def;
    }
  }
  return merged;
}

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