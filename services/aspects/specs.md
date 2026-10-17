# Аспекты Штормграда — полная спецификация проекта

Монолитный документ для onboarding новых сессий (бот-сессия, баланс-сессия, родительская сессия, будущие разработчики). Покрывает всё, что я знаю о проекте, с пометками об уверенности: ✅ — видел код, ⚠️ — знаю по описанию, ❓ — не видел, только упоминалось.

---

## 1. Обзор проекта

**Что:** веб-ККИ для 2 игроков в стиле Hearthstone, но с 5 колонками × 5 слотов и нейтральными клетками, дающими бонусы. Полностью авторская система.

**Кто:** solo-разработчик (пользователь). Активно использует параллельные AI-сессии:
- **Родительская** (архитектор, координатор, приёмщик)
- **Бот-сессия** (AI-боты)
- **Баланс-сессия** (карты, пресеты, лор)

**Где:** `D:\Anathema\services\aspects` — часть большого проекта **Anathema** (Discord-бот + веб-панель Webway).

**Ключевые принципы:**
- Детерминизм движка (seed + команды → воспроизводимые партии)
- Сервер авторитетен (клиент шлёт `Command`, сервер применяет через `applyCommand`)
- Монорепа pnpm + TypeScript, пакеты CJS (не ESM)
- Итеративная разработка, фичи на 1-2 дня

---

## 2. Инфраструктура

### 2.1. Монорепа

✅ `package.json` в корне, `pnpm-workspace.yaml`:
```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

✅ Общий `tsconfig.base.json`, каждый пакет расширяет его.

✅ Пакеты CJS: `module: CommonJS`, `moduleResolution: Node`.

✅ Vite alias на `src` (не `dist`) для frontend.

### 2.2. Пакеты

| Пакет | Путь | Роль |
|---|---|---|
| `@aspects/shared` | `packages/shared/` | Общие типы, zod-схемы, DTO, валидация, генератор колод |
| `@aspects/cards` | `packages/cards/` | Данные карт, схема, loader, реестры, генератор packs-index |
| `@aspects/engine` | `packages/engine/` | Чистый движок правил, детерминизм |
| `@aspects/bot` | `packages/bot/` | Реализации ботов (Greedy, Heuristic, MCTS) |
| `@aspects/simtools` | `packages/simtools/` | Симуляции, статистика, мета-инструменты (v0.3) |
| `@aspects/backend` | `apps/backend/` | NestJS + Fastify + Prisma + Redis, WS |
| `@aspects/frontend` | `apps/frontend/` | React + Vite, SPA под `/games/aspects/` |

### 2.3. Зависимости

```
shared ← cards ← engine ← bot ← simtools
                                  ↓
                              backend
frontend → engine, cards, bot, shared
```

Обратных зависимостей нет. `shared` не должен импортить из `cards` (цикл).

✅ `simtools` — новый пакет (v0.3), зависит от engine, cards, bot.

### 2.4. Сборка

```bash
pnpm --filter @aspects/shared build
pnpm --filter @aspects/cards build
pnpm --filter @aspects/engine build
pnpm --filter @aspects/bot build
pnpm --filter @aspects/simtools build
pnpm --filter @aspects/backend build
pnpm --filter @aspects/frontend build
```

Порядок **обязателен** — engine видит типы из cards только после cards build.

`@aspects/cards` имеет `prebuild` хуки:
- `validate` — zod-валидация всех карт, пресетов, легендарок
- `gen:packs` — генерация `packs-index.generated.ts`

---

## 3. `@aspects/cards` — данные карт

### 3.1. Структура данных

✅ `packages/cards/src/data/packs/<dir>/`:
- `meta.json` — `{ id, name, description, version }`
- `cards.json` — массив `CardDefinition`

⚠️ **Важно:** имя папки **не обязано** совпадать с `meta.id`. Например, `old_stormwind/` содержит `id: "stormwind"`. Папка — путь на диске, `id` — публичный идентификатор.

### 3.2. Реестры

✅ `packages/cards/src/data/`:
- `presets.json` — глобальные пресеты (не внутри паков)
- `personalities.json` — реестр Личностей (id → имя)
- `factions.json` — 10 фракций (id → { name, color })
- `roles.json` — роли (id → { name, icon })
- `active-series.json` — какие серии активны в UI

### 3.3. Серии и scopes

✅ **Серия (Series)** — единица релиза. Идентификатор = `meta.id`.

✅ **Scope** — набор серий для колодостроения. Определён в `packages/cards/src/scopes.ts`:

```typescript
SCOPES = {
  main:    { series: ['classic', 'cradle', 'inner', 'throne'], primary: true },
  azeroth: { series: ['stormwind', 'voidflame', 'apocryph'], primary: false },
  svo:     { series: ['steel', 'razlom', 'echo', 'sky'], primary: false },
}
```

**`main`** — фокус баланса. `azeroth` и `svo` — legacy, не смешиваются.

Колода целиком должна лежать в одном scope. `resolveScope(arg)` принимает имя scope, `"classic,throne"` или массив.

### 3.4. CardDefinition (актуально v0.3)

✅ Схема (`packages/cards/src/schema.ts`):

```typescript
{
  id: string,
  name: string,
  personalityTag: string,     // тег Личности
  cost: number,                // 0+
  strength: number,            // 0+
  health: number,              // 1+
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary',
  tags: string[],              // фракции, роли, серии, кастомные
  abilities: KeywordId[],      // charge, taunt, armored, cleave, ...
  triggers: TriggeredAbility[],
  activatedAbilities: ActivatedAbility[],
  isToken: boolean,
  sharesIdentity: boolean,
  tempDuration?: number,       // для temporary
  cleaveDamage?: number,       // default 1
  entersExhausted?: boolean,
  cantBeReplaced?: boolean,
  series?: string[],           // default = [packId]
  factions?: FactionId[],
  roles?: string[],
  title, lore, shortDescription,
  abilityInfo: Record<keyword, { name, description }>,
  isClassic?: boolean,
}
```

### 3.5. Loader API

✅ `packages/cards/src/loader.ts`:

```typescript
// Серии
listPacks(): PackMeta[]              // активные
listAllPacks(): PackMeta[]           // все
getPack(seriesId): Pack              // { meta, cards, cardsById }
getCards(seriesId): CardDefinition[]
getCardsById(seriesId): Record<string, CardDefinition>

// Scopes
listScopes(): ScopeMeta[]
getScopeMeta(scopeId): ScopeMeta | null
resolveScope(scopeOrList): string[]
scopeOfSeries(seriesId): string | null
scopeOfDeck(cardIds): string | null
cardsForScope(scope): Record<string, CardDefinition>
decksForScope(scope): DeckPreset[]

// Пресеты
getDecks(seriesId?): DeckPreset[]
decksForSeries(series[]): DeckPreset[]

// Хелперы
mergedCardsById(series[]): Record<string, CardDefinition>
mergedCards(series[]): CardDefinition[]
seriesOfDeck(cardIds): string[]
allCardsById(): Record<string, CardDefinition>
```

### 3.6. Генератор packs-index

✅ `packages/cards/scripts/gen-packs-index.mjs` — сканирует `src/data/packs/*/`, генерирует `packs-index.generated.ts`. Запускается через `prebuild`.

`validate.mts` — проверяет:
- Уникальность `meta.id` (не имя папки!)
- Валидность JSON
- Все карты проходят zod-схему
- Дубликаты карт (внутри пака и между)
- Пресеты: 30 карт, ≤1 копии легендарки, все карты существуют

---

## 4. `@aspects/engine` — движок правил

### 4.1. Ключевые типы

✅ `packages/engine/src/types/state.ts`:

```typescript
GameState = {
  definitions: Record<string, ResolvedCardDefinition>,
  cards: Record<CardInstanceId, CardInstance>,
  players: Record<PlayerId, PlayerState>,
  board: Column[],              // 5 колонок
  activePlayer: PlayerId,
  turnNumber: number,
  phase: Phase,
  seed: string,
  rngState: number,
  firstPlayer: PlayerId,
  winner: PlayerId | null,
  winnerReason: string | null,
  altVictoryPending: Record<PlayerId, boolean>,
  pendingChoice: PendingChoice | null,
  pendingTriggers: PendingTrigger[],
  instanceCounter: number,
  mulliganDone: Record<PlayerId, boolean>,
  mulliganReplaced: Record<PlayerId, number>,
}

CardInstance = {
  instanceId, definitionId, ownerId, controllerId,
  zone: 'DECK' | 'HAND' | 'RESERVE' | 'FRONT' | 'DISCARD',
  column: ColumnIndex | null,
  baseHealth, baseStrength, damageTaken, modifiers: Modifier[],
  exhausted, slowCounter, shieldAvailable,
  turnsOnBoard,
  usedAbilitiesThisTurn: number[],
  usedTriggerIdsThisTurn: string[],
  attacksThisTurn: number,      // для frenzy
  isToken, sharesIdentity,
  tempTurnsLeft: number | null,
  readyForFront: boolean,
  silenced: boolean,
}
```

⚠️ `PendingChoice` kinds:
- `END_TURN_DISCARD` — сброс в конце хода (>10 карт)
- `EFFECT_TARGET_SELECTION` — выбор цели эффекта
- `REPLACE_TARGET_SELECTION` — выбор цели замены
- `DISCARD_CHOSEN` — выбор карт для сброса (не свой выбор)
- `ACTIVATION_DISCARD` — сброс для активируемой способности

### 4.2. Команды

✅ `packages/engine/src/types/commands.ts`:

```typescript
Command =
  | { type: 'START_GAME' }
  | { type: 'ADVANCE_PHASE', playerId }
  | { type: 'PLAY_CARD', playerId, cardId, column }
  | { type: 'REPLACE_CARD', playerId, cardId }
  | { type: 'ATTACK', playerId, attackerId, target }
  | { type: 'USE_ABILITY', playerId, cardId, abilityIndex }
  | { type: 'END_TURN', playerId }
  | { type: 'MULLIGAN', playerId, cardId | null }
  | { type: 'RESOLVE_CHOICE', playerId, cardIds }
  | { type: 'CANCEL_CHOICE', playerId }

AttackTarget =
  | { kind: 'CARD', cardId }
  | { kind: 'NEUTRAL', column }
  | { kind: 'GUILD', playerId }
```

### 4.3. Ключевые модули

✅ `packages/engine/src/`:
- `state/create.ts` — `createGame`, дефолты (glory 25, стартовая рука 4, inject starter)
- `state/helpers.ts` — `health`, `strength`, `strengthInBattle`, `frontCount`, `controlledCells`, `cardAbilities`, `cardTriggers`, `maxAttacksFor`, `canAttackMore`
- `state/mutations.ts` — `changeInfluence`, `damageGlory`, `healGlory`, `killCard`, `promoteFromReserve`, `resetCardRuntimeState`
- `state/damage.ts` — `damageCard` (щит → defense колонки → armor → damage)
- `state/tokens.ts` — `summonToken` (случайный свободный слот)
- `state/cardFilter.ts` — `matchesFilter` (tag, keyword, minStrength, withoutShield)
- `state/suppression.ts` — пересчёт suppress
- `state/abilities.ts` — `hasAbility`, `tauntInColumn`, `canAttackReserve`
- `state/rng.ts` — `randomIndex`, `randomElement` (детерминированный)
- `abilities/conditions.ts` — `evaluateCondition` (с композицией AND/OR/NOT)
- `abilities/effectResolver.ts` — `resolveEffect` (все эффекты)
- `abilities/triggerEngine.ts` — `queuePhaseTriggers`
- `abilities/triggerQueue.ts` — `drainTriggerQueue` (safety 500)
- `abilities/cellEvents.ts` — `notifyCellCaptured`, `notifyCellLost`
- `abilities/reactions.ts` — `notifyAllyDied`, `notifyAllyAttacked`, `notifyEnemyAttack`
- `commands/applyCommand.ts` — главный entry point
- `commands/attack.ts` — боевая логика
- `commands/replace.ts` — замена (v0.3: **скидка**)
- `commands/resolveChoice.ts` — резолв pendingChoice
- `commands/cancelChoice.ts` — отмена (кроме обязательных)
- `commands/playCard.ts` — розыгрыш
- `commands/advancePhase.ts` — фазы, `doRegenerate`, `processTemporaryCards`
- `commands/endTurn.ts`
- `commands/mulligan.ts`
- `commands/useAbility.ts` — активируемые, `applyActivationDiscard`
- `state/validActions.ts` — `getValidActions`
- `state/preview.ts` — `previewCardAttack`, `simulateAttackFully`
- `types/events.ts` — все `GameEvent` kinds

### 4.4. Правила v0.3 (кратко)

⚠️ **Полный Rulebook** — отдельный документ (см. раздел «Правила»). Ключевое:

- **Glory 25** (было 30)
- **Despair off** (было auto-promote при glory < 10)
- **Alt-victory мгновенная** (5/5 = победа, было 2 хода подряд)
- **Underdog-draw off**, **underdog-influence on**
- **Замена со скидкой** `min(floor(old/2), floor(new/2))`
- **Токены не конфликтуют** по Личности при призыве
- **Атака по гильдии** — только при пустом фронте
- **Случайный слот призыва**

### 4.5. Детерминизм

✅ `createGame({ seed })` + последовательность `Command` → воспроизводимая партия. Всё RNG — через `state.rngState` (mulberry32).

**Никаких** `Math.random()` в engine, cards, bot.

---

## 5. `@aspects/bot` — AI

### 5.1. Реализации

✅ `packages/bot/src/`:
- `greedy.ts` — GreedyBot (жадный, самый простой)
- `heuristic.ts` — HeuristicBot (основной, v6.1)
- `mcts.ts` — MctsBot (UCT-MCTS, для турниров)
- `profile.ts` — 6 профилей × 6 уровней
- `bot-factory.ts` — `makeBot(name)`, feature flags по уровню
- `types.ts` — интерфейс `Bot`
- `responder.ts` — `pickResponder(state)` (утилита)

### 5.2. Профили и уровни

✅ Профили (веса):
- `balanced` — универсал
- `aggro` — агрессивный
- `defensive` — оборонительный
- `control` — контроль
- `opportunist` — оппортунист
- `berserker` — берсерк

Уровни (`mistakeRate`, `mistakeWidth`, `temperature`):
- `rookie`, `novice`, `regular`, `veteran`, `master`, `grandmaster`

Идентификатор: `heuristic-v5-<profile>-<level>` (36 комбинаций).

### 5.3. Feature flags по уровню

✅ `LEVEL_FEATURES` в `bot-factory.ts`:
- `rookie` — голый бот
- `novice` — + smartMulliganV2
- `regular` — + smartReplace + column5Penalty
- `veteran` — + smartDiscard + lateGameNeutralFix
- `master`/`grandmaster` — всё (smartAbility, smartDiscard, smartReplace, v4Attack, v4Triggers, v4MulliganV2, v4ReplaceV2)

⚠️ `v5Lookahead` и `v5AltVictory` **отключены** — тестирование показало ухудшение.

### 5.4. HeuristicBot v6.1 (актуально)

✅ Ключевые методы в `heuristic.ts`:
- `chooseCommand` — entry point
- `chooseMulligan` / `smartMulliganV2`
- `pickBestPlayAction` — выбор карты для розыгрыша
- `scoreReplaceCardV2` — **с учётом скидки** (v0.3)
- `pickReplaceTarget` — выбор цели замены (silenced бонус −1000)
- `scoreNeutralAttack` — **с alt-victory awareness** (5/5 = победа)
- `pickSmartAbility` — с `discardCost` в net
- `scoreAttackHeur` — оценка атаки (frenzy, cleave, armored, alt-victory)
- `pickAttackWithLookahead` — 1-полуход lookahead
- `resolveChoice` — для всех `PendingChoice` kinds
- `pickGuildInterceptor` — **есть, но не используется** (interceptor откачен)

### 5.5. Тестирование

✅ `packages/bot/src/__tests__/bots.test.ts`:
- Детерминизм (`GreedyBot`, `HeuristicBot` с temperature 0 и >0)
- Разные seed → разные партии
- `temperature = 0` = прежнее поведение

---

## 6. `@aspects/simtools` — мета-инструменты (v0.3)

### 6.1. Архитектура

✅ `packages/simtools/`:
- `src/types.ts` — `RunOptions`, `RunSeriesOptions`, `SeriesResult`, `SingleGameResult`
- `src/bots.ts` — реэкспорт из `@aspects/bot`
- `src/runner.ts` — `runOneGame`, `runOneGameRaw`, `runSeries`, `pickResponder`, `resolveDeck`
- `src/index.ts` — публичный API

### 6.2. CLI-скрипты

✅ `packages/simtools/scripts/`:

| Скрипт | Что делает | Приоритет |
|---|---|---|
| `list` | Показать паки, пресеты, ботов | 🔴 |
| `simulate` | Серия между 2 колодами | 🟡 |
| `matrix` | N×N матрица winrate | 🔴 |
| `duel` | A/B двух ботов | 🔴 |
| `first-player` | First-mover advantage | 🟡 |
| `trace` | Пошаговая трассировка партии | 🔴 |
| `dump-state` | Дамп GameState в JSON | 🟡 |
| `card-stats` | Δ-метрика по картам | 🔴 |
| `meta-report` | Winrate по пресетам и сериям | 🟡 |
| `pace-report` | Длина партии, cost, hand bloat, underdog, alt-victory | 🔴 |
| `attack-efficiency` | Куда уходят атаки (direct/intercepted/kill/trade/chip) | 🔴 |
| `board-state-timeline` | Динамика доски по ходам | 🟢 |
| `turn-outcome` | Winrate по длине партии | 🟡 |
| `replacement-analysis` | Замены (utilization, wins by replacer) | 🔴 |
| `combat-efficiency` | Судьба карт, жизнь, face share | 🟡 |
| `missed-lethal` | Детектор упущенных леталов | 🟢 |
| `find-long-games` | Поиск долгих партий (>45 ходов) | 🟡 |
| `deck-diff` | Сравнение двух пресетов | 🟢 |
| `keyword-stats` | Winrate по keywords | 🟢 |
| `matchup-heatmap` | Цветная матрица | 🟢 |
| `deck-optimizer` | Генетика по колодам | 🟡 |

### 6.3. Ключевые метрики

✅ **`pace-report`** — главный инструмент для pace:
- Mean / Median turns
- Avg cost played
- Hand size (по бакетам ходов)
- Неистраченное влияние
- Underdog triggers
- Idle turns
- First glory <20 / <10
- Reasons (glory_zero / alt_victory)

✅ **`attack-efficiency`** — куда уходят атаки:
- `guild_direct`, `guild_intercepted` (было, interceptor откачен)
- `kill`, `trade`, `chip`, `suicide`, `shield_blocked`
- `neutral`
- Средний удар

✅ **`card-stats`** — Δ-метрика:
- `Δ = winrate_when_played − winrate_when_drawn_not_played`
- `playRate`
- `median turn`

### 6.4. Документация

✅ `docs/simtools-reference.md` — полный справочник по всем инструментам (методология, параметры, интерпретация).

⚠️ Нужно обновить под v0.3 (убрать interceptor, добавить underdog-триггеры, find-long-games).

---

## 7. `@aspects/backend` — сервер

⚠️ Видел частично. Общее:

- **NestJS + Fastify** — HTTP API
- **Prisma + Postgres** (`anathemaaspects` DB)
- **Redis** (db 1 — комнаты, db 0 — сессии Webway)
- **WebSocket** — socket.io под `/games/aspects/ws/`
- **Glicko-2** — рейтинги (`apps/backend/src/rating/glicko2.ts`)
- **Tournament** — `apps/backend/src/scripts/tournament.ts` (прогон 1200 партий, обновление рейтингов в БД)

### 7.1. Prisma-модели

⚠️ Из контекста:
- `User`, `Deck` (series String[], packId удалён), `DeckCard`
- `Match` (series String[], cardSnapshot Json), `MatchDeck`, `MatchCommand`
- `Rating`, `RatingHistory`, `BotRating`, `Friendship`, `UserProfile`

Миграции **ручные** (`prisma migrate deploy`).

### 7.2. WebSocket события

⚠️ `state_sync`, `state_update`, `command`, `command_error`, `game_over`, `rematch_*`, `opponent_left`, `opponent_joined`, `room_expired`.

### 7.3. Tournament

✅ `apps/backend/src/scripts/tournament.ts`:
- Итерирует по всем ботам (36)
- Случайная пара + случайный пресет
- Glicko-2 обновление
- Прогон через `runOneGame` из simtools
- Upsert в `BotRating`

✅ **Docker**: `Dockerfile` требует явный COPY для `packages/simtools/package.json` + build. Три правки в Dockerfile.

---

## 8. `@aspects/frontend` — SPA

⚠️ Видел частично. React + Vite.

### 8.1. Ключевые компоненты

✅ `apps/frontend/src/components/`:
- `Board.tsx`, `CardSlot.tsx` — доска
- `Hand.tsx` — рука
- `PlayerPanel.tsx` — панель игрока
- `PhaseControls.tsx` — управление фазой
- `Log.tsx` — лог
- `ChoicePrompt.tsx` — модалка для pendingChoice (все kinds)
- `ActionMenu.tsx` — меню действий карты
- `VictoryModal.tsx`, `RematchDialog.tsx`, `OpponentLeftDialog.tsx`
- `MulliganScreen.tsx`
- `CardTooltip.tsx`, `CardTooltipDef.tsx` — тултипы
- `SetupScreen.tsx`, `DecksScreen.tsx`, `DeckEditorScreen.tsx`
- `MatchmakingScreen.tsx`, `OnlineLobbyScreen.tsx`, `OnlineGameScreen.tsx`
- `ProfileScreen.tsx`, `MatchesScreen.tsx`, `ReplayScreen.tsx`
- `LeaderboardScreen.tsx`, `UserProfileScreen.tsx`, `UsersSearchScreen.tsx`
- `FriendsScreen.tsx`

### 8.2. Хуки

✅ `apps/frontend/src/game/`:
- `useGame.ts` — хотсит / bot
- `useOnlineGame.ts` — онлайн
- `useAuth.ts`, `useDecks.ts`, `useMatches.ts`, `useMatchmaking.ts`, `useScreenRouting.ts`

### 8.3. Утилиты

✅ `apps/frontend/src/game/`:
- `abilityText.ts` — резолв текста эффектов, условий, keywords
- `logEntry.ts` — `GameEvent` → строка лога
- `floatings.ts` — floating numbers на доске
- `anonId.ts` — cookie `aspects_anon_id`
- `errorMessage.ts`

### 8.4. Стили

✅ `apps/frontend/src/styles/`:
- `00-tokens.css` — CSS-переменные (тема)
- `03-board.css`, `06-hand.css`, `07-tooltip.css`
- `10-v2-shell.css` — общий каркас (page-card, page-tile и т.д.)

**Тема:** все цвета через `--clr-*`. Не хардкодить.

---

## 9. Правила (Rulebook)

⚠️ Отдельный документ `Rulebook v0.3` — полный текст правил. Ключевые изменения v0.3:

| Что | Было | Стало |
|---|---|---|
| Glory | 30 | **25** |
| Despair | on | **off** |
| Alt-victory | 2 хода | **мгновенная** |
| Underdog-draw | on | **off** |
| Замена | полная стоимость | **скидка** |
| Токены и Личность | конфликт | **не конфликтуют** |
| Слот призыва | первый свободный | **случайный** |

Механики, добавленные за итерации:
- Keywords: `armored`, `regenerate`, `cleave`, `frenzy`, `starter`
- Эффекты: `SILENCE_TARGET`, `EXHAUST_TARGET`, `UNEXHAUST_TARGET`, `MOVE_TO_COLUMN`, `DISCARD_CHOSEN`, `SPEND_INFLUENCE`
- Триггеры: `ON_ATTACK`, `ON_KILL`, `ON_CELL_CAPTURED`, `ON_CELL_LOST`, `ON_DAMAGE_DEALT`, `ON_CARD_DRAWN`
- Условия: `AND/OR/NOT`, `TOTAL_STRENGTH/HEALTH`, `IN_RESERVE/FRONT`, `TURN_NUMBER`, `IS_FIRST_PLAYER`
- Селектор `OPPOSITE`
- `filter` параметр (tag, keyword, minStrength, minCost, withoutShield)
- `discardCost` на активируемых
- `entersExhausted`, `cantBeReplaced`

**Отложено:**
- Fatigue (нарастающий урон в долгих партиях)
- Реактивная защита клеток
- Ping-pong урон при захвате
- Dobor vs Influence

---

## 10. Деплой

### 10.1. Инфраструктура

⚠️ Тот же сервер, что Webway/Anathema. **Caddy** проксирует:
- `/games/aspects/` → SPA (nginx, порт 8011)
- `/games/aspects/api/*` → `aspects_backend:8010` (forward_auth через Webway)
- `/games/aspects/ws/*` → `aspects_backend:8010` (WebSocket, **без forward_auth** — ломает upgrade)

### 10.2. Docker

✅ `apps/backend/Dockerfile` и `apps/frontend/Dockerfile` (мультистейдж).

**Backend:**
- Stage build (node:22-alpine) → установка зависимостей, сборка пакетов в порядке (shared → cards → engine → bot → simtools → backend)
- Stage runtime (node:22-alpine) → копия `/app` целиком, `prisma migrate deploy`, `node dist/main.js`

**При добавлении нового пакета в backend** — правка Dockerfile:
1. COPY манифеста
2. Сборка в правильном порядке

**Frontend** — новый пакет **не трогает** (SPA не использует CLI).

### 10.3. Сеть

⚠️ `anathema_network` (Docker).

### 10.4. Webway auth

⚠️ Cookie анонима: `aspects_anon_id` (UUID), TTL 30 дней, `path=/games/aspects`.

---

## 11. Тестирование

### 11.1. Vitest

✅ `pnpm --filter @aspects/engine test` — 22 файла, ~168 тестов.
✅ `pnpm --filter @aspects/bot test` — 4 файла (детерминизм).
✅ `pnpm --filter @aspects/cards test` — normalize.test.ts.

### 11.2. Что покрыто

- Engine: команды, условия, эффекты, бой, замена, pending choices, токены, triggered abilities, alt-victory (мгновенная)
- Cards: normalizeCard, KEYWORD_INFO
- Bot: детерминизм

### 11.3. Что не покрыто

- Новые mechanics (cleave, frenzy, armored, silence) — только smoke
- Alt-victory мгновенная — есть 3 теста
- Замена со скидкой — **нет теста** (только manual)
- `validActions` с учётом скидки — **нет теста**

---

## 12. Архитектурные решения (не пересматривать)

1. **Сервер авторитетен.** Клиент шлёт `Command`, сервер применяет через `applyCommand`.
2. **Персональная рассылка state.** Чужая рука скрыта.
3. **Детерминизм движка** через seed + команды. Реплеи бесплатны.
4. **Caddy НЕ делает forward_auth для WS** — ломает upgrade.
5. **Cookie для анонимов** — `aspects_anon_id`, UUID, TTL 30 дней, path=`/games/aspects`.
6. **Prisma-миграции вручную** (`migrate deploy`).
7. **Пакеты в CJS** (не ESM).
8. **Vite alias на `src`** (не `dist`).
9. **`app.select(RoomsModule).get(RoomsService)` в socket-io** (не `app.get`).
10. **`getDecks(packId)` фильтрует пресеты через `.every`.** Для multi-series использовать `decksForSeries`.
11. **Пресеты глобальные** (`data/presets.json`), не внутри паков.
12. **`meta.id` ≠ имя папки** — валидатор проверяет только уникальность `id`.
13. **Симуляции — в `simtools`**, не в `bot` и не в `backend`.
14. **`shared` не импортит из `cards`** (цикл).

---

## 13. Подводные камни

- **Discord user_id (18 цифр) теряет точность через `JSON.parse`** — читать regex.
- **Кириллица в HTTP-заголовках** — `encodeURIComponent`.
- **`forward_auth` ломает WS upgrade в Caddy.**
- **`pnpm install + --no-cache` в Docker** при новых пакетах.
- **`@aspects/shared` не должен импортить из `@aspects/cards`** (цикл).
- **`console.log` в backend** заменить на `pino` (планируется).
- **`WritableDraft<PendingChoice>` от immer не распределяется по union'у** — не делать `switch (choice.kind)` с `never`-check на самом объекте. Использовать `switch` по полю без `never`-assertion.
- **Тесты в `scripts/` не должны импортировать собственный пакет** (`@aspects/simtools` из simtools) — использовать относительные пути.
- **`pnpm run --filter X list`** — не `pnpm --filter X list` (встроенная `list` перехватывает).
- **`placeCard` direct в тестах** должен учитывать новое поле `pendingChoice` (нельзя если оно уже есть).

---

## 14. Стиль работы

- **Отвечать по-русски.**
- **Полные файлы** для замены вместо diff'ов, если файл небольшой.
- **Пути от `D:\Anathema\services\aspects`.**
- **Сборка после каждого патча:** shared → cards → engine → bot → (backend/frontend).
- **Конвенции:**
  - Размер колоды 30
  - ≤5 копий личности
  - ≤2 копий аспекта
  - ≤1 легендарки
  - ≤4 серий
- **Не менять движок** в процессе UI-работы без причины.
- **Комментарии в коде** — минимально.
- **Не оставлять title/shortDescription/lore пустыми.**
- **Разбивать большие фичи на итерации** (1-2 дня).

---

## 15. Роли сессий

### 🎯 Родительская (архитектор)

- Архитектурные решения
- Координация делегирования
- Приёмка работы дочерних сессий
- Мета-инструменты
- Baseline (Rulebook, docs)

### 🤖 Бот-сессия

- Реализации ботов (HeuristicBot, GreedyBot, MCTS)
- Профили, feature flags
- Scoring: attacks, replacements, neutral, abilities
- Цель: играть осмысленно в текущих механиках

### ⚖️ Баланс-сессия

- Карты (новые, балансировка)
- Пресеты
- Лор
- Серии, фракции, роли
- Цель: контент даёт пространство для игры

### ❓ Возможные будущие

- **UI-сессия** — фронтенд компоненты
- **Backend-сессия** — API, БД, турнир
- **Sound/Art-сессия**

---

## 16. Baseline v0.3 (снимок на момент спецификации)

**Правила:**
- Glory 25, Despair off, Alt-victory мгновенная, Underdog-draw off, замена со скидкой.

**Pace:**
- Mean turns **24.3**
- Median **22**
- Хвост 45+ **2.7%**
- Hand bloat (late) **7.37**
- Alt-victory **12.5%**
- Suicide **0%**
- Died 1-turn **19.6%**

**Данные:**
- Карт в паках: ~282
- Пресетов: 11 (в `main` — 5: strazha, divan, partizany, throne_verdict_v2, inner_coup_v2)
- Средний cost карт: 2.17
- 90% карт cost 1-2, 0.1% cost 5+

**Боты:** 36 (6 профилей × 6 уровней).

**Инструменты:** 21 CLI-скрипт в `simtools`.

---

## 17. Что важно знать новой сессии

### 17.1. Что прочитать сначала

1. Этот документ (полный контекст).
2. `Rulebook v0.3` — актуальные правила.
3. `docs/simtools-reference.md` — инструменты.
4. Если работа с картами — `packages/cards/src/schema.ts`.
5. Если с движком — `packages/engine/src/types/state.ts`, `commands/applyCommand.ts`.

### 17.2. Что спросить у пользователя

- **Роль сессии** (родительская, бот, баланс)
- **Что делаем сейчас** (контент, полировка, долги)
- **Baseline** — текущие метрики (пользователь прогонит `pace-report`, если нужно)
- **Файлы**, которые не видел (если нужны для задачи — попросить)

### 17.3. Что НЕ делать без разрешения

- Не менять правила (это движок — только родитель).
- Не менять существующие карты без согласования с балансом.
- Не переписывать ботов без задачи от родителя.
- Не трогать `Webway` / `Anathema` — это отдельный проект.

### 17.4. Куда смотреть, если что-то сломалось

- **Сборка** → `pnpm --filter X build`, читать TS-ошибки
- **Тесты** → `pnpm --filter X test`
- **Партия падает** → `trace` в simtools с seed
- **Данные карт** → `pnpm --filter @aspects/cards validate`
- **Мета-инструменты** → `docs/simtools-reference.md`
- **Правила** → Rulebook v0.3

---

## 18. Долги / roadmap

### 🔴 Высокий приоритет

1. **Карты cost 4-5** (8-10 штук) — баланс-сессия. Ramp не имеет смысла без них.
2. **Cross-variant карты** (5-6 пар) — для замены. Сейчас 12.5% util = потолок.
3. **Payoff для клеток** (3-4 карты) — alt-victory 12.5% → 15-18%.

### 🟡 Средний приоритет

4. **Fatigue** — если хвост 45+ снова вырастет.
5. **UI: модалка для новых PendingChoice kinds** (DISCARD_CHOSEN, ACTIVATION_DISCARD).
6. **Тесты для новых механик** (cleave, frenzy, armored, silence, замена со скидкой).
7. **Обновить `docs/simtools-reference.md`** под v0.3.
8. **Фикс расхождения alt_victory%** между `pace-report` и `turn-outcome` (2pp).

### 🟢 Низкий приоритет

9. `pino`-логи в backend.
10. CI/CD.
11. Метрики Prometheus.
12. `Anon → Webway merge` (концепт есть).
13. Прогрессия (осколки, крафт, бустеры).
14. PvE, режимы, кооператив.
15. Мобильная адаптация.
16. Drag-and-drop в UI.
17. Туториал.
18. Legacy-миграция данных (azeroth / svo / merged колоды).

---

## 19. Полезные команды

```bash
# Сборка всех пакетов в порядке
pnpm --filter @aspects/shared build
pnpm --filter @aspects/cards build
pnpm --filter @aspects/engine build
pnpm --filter @aspects/bot build
pnpm --filter @aspects/simtools build
pnpm --filter @aspects/backend build
pnpm --filter @aspects/frontend build

# Тесты
pnpm --filter @aspects/engine test
pnpm --filter @aspects/bot test
pnpm --filter @aspects/cards test

# Валидация карт
pnpm --filter @aspects/cards validate

# Мета-инструменты
pnpm run --filter @aspects/simtools list
pnpm run --filter @aspects/simtools pace-report main 100
pnpm run --filter @aspects/simtools attack-efficiency main 100
pnpm run --filter @aspects/simtools turn-outcome main 100
pnpm run --filter @aspects/simtools card-stats main 100
pnpm run --filter @aspects/simtools matrix main 50
pnpm run --filter @aspects/simtools duel main 50 <botA> <botB>
pnpm run --filter @aspects/simtools replacement-analysis main 100
pnpm run --filter @aspects/simtools find-long-games main 100
pnpm run --filter @aspects/simtools trace main <deck1> <deck2> <seed> <botName>

# Турнир (backend)
pnpm --filter @aspects/backend tournament

# Docker
docker compose up -d --build aspects_backend aspects_frontend
```

---

**Конец спецификации.** Обновлено на момент после баланс-итерации v0.3 (glory 25, Despair off, замена со скидкой, бот v6.1).