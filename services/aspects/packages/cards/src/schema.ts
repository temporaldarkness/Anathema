import { z } from 'zod';
import {
  KEYWORD_IDS,
  TRIGGER_TYPES,
  TARGET_SELECTORS,
  COMPARATORS,
  CONDITION_SIDES,
  FACTION_IDS,
} from './abilities';

export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;

const CardFilterSchema = z.object({
  tag: z.string().optional(),
  keyword: z.enum(KEYWORD_IDS).optional(),
  minStrength: z.number().int().optional(),
  maxStrength: z.number().int().optional(),
  minCost: z.number().int().min(0).optional(),
  maxCost: z.number().int().min(0).optional(),
  withoutShield: z.boolean().optional(),
});

const ConditionSchema: z.ZodType<import('./abilities').Condition> = z.lazy(() =>
  z.union([
    z.object({ kind: z.literal('CELLS'), who: z.enum(CONDITION_SIDES), op: z.enum(COMPARATORS), value: z.number().int().min(0) }),
    z.object({
      kind: z.literal('FRONT_COUNT'),
      who: z.enum(CONDITION_SIDES),
      op: z.enum(COMPARATORS),
      value: z.number().int().min(0),
      filter: CardFilterSchema.optional(),
    }),
    z.object({ kind: z.literal('GLORY'), who: z.enum(CONDITION_SIDES), op: z.enum(COMPARATORS), value: z.number().int().min(0) }),
    z.object({ kind: z.literal('INFLUENCE'), who: z.enum(CONDITION_SIDES), op: z.enum(COMPARATORS), value: z.number().int().min(0) }),
    z.object({
      kind: z.literal('HAND_COUNT'),
      who: z.enum(CONDITION_SIDES),
      op: z.enum(COMPARATORS),
      value: z.number().int().min(0),
      filter: CardFilterSchema.optional(),
    }),
    z.object({ kind: z.literal('SELF_HEALTH'), op: z.enum(COMPARATORS), value: z.number().int() }),
    z.object({ kind: z.literal('SELF_STRENGTH'), op: z.enum(COMPARATORS), value: z.number().int() }),
    z.object({
      kind: z.literal('TOTAL_STRENGTH'),
      who: z.enum(CONDITION_SIDES),
      op: z.enum(COMPARATORS),
      value: z.number().int().min(0),
      filter: CardFilterSchema.optional(),
    }),
    z.object({
      kind: z.literal('TOTAL_HEALTH'),
      who: z.enum(CONDITION_SIDES),
      op: z.enum(COMPARATORS),
      value: z.number().int().min(0),
      filter: CardFilterSchema.optional(),
    }),
    z.object({ kind: z.literal('IN_RESERVE') }),
    z.object({ kind: z.literal('IN_FRONT') }),
    z.object({ kind: z.literal('TURN_NUMBER'), op: z.enum(COMPARATORS), value: z.number().int().min(0) }),
    z.object({ kind: z.literal('IS_FIRST_PLAYER') }),
    z.object({ kind: z.literal('AND'), conditions: z.array(ConditionSchema).min(1) }),
    z.object({ kind: z.literal('OR'), conditions: z.array(ConditionSchema).min(1) }),
    z.object({ kind: z.literal('NOT'), condition: ConditionSchema }),
  ]),
) as any;

const EffectSchema: z.ZodType<import('./abilities').Effect> = z.lazy(() =>
  z.union([
    z.object({ kind: z.literal('DEAL_DAMAGE'), amount: z.number().int().min(0), target: z.enum(TARGET_SELECTORS), filter: CardFilterSchema.optional() }),
    z.object({ kind: z.literal('HEAL'), amount: z.number().int().min(0), target: z.enum(TARGET_SELECTORS), filter: CardFilterSchema.optional() }),
    z.object({ kind: z.literal('BUFF'), strength: z.number().int(), health: z.number().int(), target: z.enum(TARGET_SELECTORS), filter: CardFilterSchema.optional() }),
    z.object({ kind: z.literal('GRANT_SHIELD'), target: z.enum(TARGET_SELECTORS), filter: CardFilterSchema.optional() }),
    z.object({ kind: z.literal('EXHAUST_TARGET'), target: z.enum(TARGET_SELECTORS), filter: CardFilterSchema.optional() }),
    z.object({ kind: z.literal('UNEXHAUST_TARGET'), target: z.enum(TARGET_SELECTORS), filter: CardFilterSchema.optional() }),
    z.object({ kind: z.literal('SILENCE_TARGET'), target: z.enum(TARGET_SELECTORS), filter: CardFilterSchema.optional() }),
    z.object({ kind: z.literal('DRAW'), count: z.number().int().min(1), who: z.enum(['SELF', 'OPPONENT']) }),
    z.object({ kind: z.literal('GAIN_INFLUENCE'), amount: z.number().int(), who: z.enum(['SELF', 'OPPONENT']) }),
    z.object({ kind: z.literal('SPEND_INFLUENCE'), amount: z.number().int().min(1), who: z.enum(['SELF', 'OPPONENT']) }),
    z.object({ kind: z.literal('DAMAGE_GLORY'), amount: z.number().int().min(1), who: z.enum(['SELF', 'OPPONENT']) }),
    z.object({ kind: z.literal('HEAL_GLORY'), amount: z.number().int().min(1), who: z.enum(['SELF', 'OPPONENT']) }),
    z.object({
      kind: z.literal('CHOOSE_TARGETS_THEN'),
      selection: z.object({
        from: z.enum(['ENEMY_FRONT', 'ENEMY_BOARD', 'FRIENDLY_FRONT', 'FRIENDLY_BOARD', 'ANY_FRONT', 'ANY_CARD']),
        count: z.number().int().min(1),
      }),
      then: z.array(EffectSchema),
    }),
    z.object({
      kind: z.literal('SUMMON'),
      defId: z.string(),
      count: z.number().int().min(1).max(5),
      who: z.enum(['SELF', 'OPPONENT']),
      destination: z.enum(['FRONT', 'RESERVE', 'HAND']).optional(),
    }),
    z.object({
      kind: z.literal('RETURN_TO_HAND'),
      target: z.enum(TARGET_SELECTORS),
      filter: CardFilterSchema.optional(),
    }),
    z.object({
      kind: z.literal('MOVE_CARD'),
      target: z.enum(TARGET_SELECTORS),
      filter: CardFilterSchema.optional(),
      to: z.enum(['RANDOM_OWN_EMPTY', 'OWN_RESERVE']),
    }),
    z.object({
      kind: z.literal('MOVE_TO_COLUMN'),
      target: z.enum(TARGET_SELECTORS),
      filter: CardFilterSchema.optional(),
      column: z.number().int().min(1).max(5),
    }),
    z.object({
      kind: z.literal('RETURN_FROM_DISCARD'),
      count: z.number().int().min(1).max(5),
      who: z.enum(['SELF', 'OPPONENT']),
      destination: z.enum(['HAND', 'DECK_TOP']),
    }),
    z.object({
      kind: z.literal('DISCARD_RANDOM'),
      count: z.number().int().min(1).max(5),
      who: z.enum(['SELF', 'OPPONENT']),
    }),
    z.object({
      kind: z.literal('DISCARD_CHOSEN'),
      count: z.number().int().min(1).max(5),
      who: z.enum(['SELF', 'OPPONENT']),
    }),
  ]),
) as any;

const TriggeredAbilitySchema = z.object({
  id: z.string().optional(),
  trigger: z.enum(TRIGGER_TYPES),
  condition: ConditionSchema.optional(),
  oncePerTurn: z.boolean().optional(),
  effects: z.array(EffectSchema),
  name: z.string().optional(),
  description: z.string().optional(),
});

const ActivatedAbilitySchema = z.object({
  id: z.string(),
  cost: z.number().int().min(0),
  effects: z.array(EffectSchema),
  discardCost: z.number().int().min(0).max(5).optional(),
  name: z.string().optional(),
  description: z.string().optional(),
});

export const AbilityInfoSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
});

export const CardDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  personalityTag: z.string(),
  cost: z.number().int().min(0),
  strength: z.number().int().min(0),
  health: z.number().int().min(1),
  rarity: z.enum(RARITIES),

  tags: z.array(z.string()).default([]),

  abilities: z.array(z.enum(KEYWORD_IDS)).default([]),
  triggers: z.array(TriggeredAbilitySchema).default([]),
  activatedAbilities: z.array(ActivatedAbilitySchema).default([]),
  isToken: z.boolean().default(false),
  sharesIdentity: z.boolean().default(false),
  tempDuration: z.number().int().min(1).max(10).optional(),
  cleaveDamage: z.number().int().min(1).max(10).optional(),
  entersExhausted: z.boolean().optional(),
  cantBeReplaced: z.boolean().optional(),

  series: z.array(z.string()).optional(),
  factions: z.array(z.enum(FACTION_IDS)).optional(),
  roles: z.array(z.string()).optional(),

  title: z.string().optional(),
  lore: z.string().optional(),
  shortDescription: z.string().optional(),

  abilityInfo: z.record(z.string(), AbilityInfoSchema).optional(),

  isClassic: z.boolean().optional(),
});

export type CardDefinition = z.input<typeof CardDefinitionSchema>;
export type ResolvedCardDefinition = z.output<typeof CardDefinitionSchema>;