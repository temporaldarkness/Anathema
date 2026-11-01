import { Injectable, Logger } from '@nestjs/common';
import { allCardsById, type CardDefinition } from '@aspects/cards';
import { Rarity } from './economy.types';

export interface EconomyCardDefinition {
  id: string;
  rarity: Rarity;
  primarySeries: string;
  allSeries: string[];
  name?: string;
  raw: CardDefinition;
}

const RARITY_UPPER: Record<string, Rarity> = {
  COMMON: 'COMMON',
  UNCOMMON: 'UNCOMMON',
  RARE: 'RARE',
  EPIC: 'EPIC',
  LEGENDARY: 'LEGENDARY',
};

@Injectable()
export class CardsCatalogService {
  private readonly logger = new Logger(CardsCatalogService.name);
  private readonly byId = new Map<string, EconomyCardDefinition>();
  private readonly all: EconomyCardDefinition[] = [];

  constructor() {
    const raw = allCardsById();
    let skipped = 0;

    for (const [id, def] of Object.entries(raw)) {
      if ((def as any).isToken) {
        skipped++;
        continue;
      }

      const rar = String((def as any).rarity ?? '').toUpperCase();
      const rarity = RARITY_UPPER[rar];
      if (!rarity) {
        skipped++;
        continue;
      }

      const allSeries: string[] = Array.isArray((def as any).series)
        ? ((def as any).series as string[])
        : [];
      const primarySeries: string =
        allSeries[0] ?? (def as any).seriesId ?? '';
        
      if (!primarySeries) {
        skipped++;
        continue;
      }

      const entry: EconomyCardDefinition = {
        id,
        rarity,
        primarySeries,
        allSeries: allSeries.length > 0 ? allSeries : [primarySeries],
        name: (def as any).name,
        raw: def,
      };
      this.byId.set(id, entry);
      this.all.push(entry);
    }

    this.logger.log(
      `CardsCatalog: ${this.all.length} cards loaded, ${skipped} skipped`,
    );
  }

  getById(cardDefId: string): EconomyCardDefinition | undefined {
    return this.byId.get(cardDefId);
  }

  getBySeries(seriesIds: string[]): EconomyCardDefinition[] {
    const set = new Set(seriesIds);
    return this.all.filter((c) => c.allSeries.some((s) => set.has(s)));
  }
}