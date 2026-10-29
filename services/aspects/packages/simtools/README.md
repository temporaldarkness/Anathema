# `@aspects/simtools` — справочник по мета-инструментам (v0.3.1)

Монолитный документ, описывающий всю систему симуляций и анализа игры «Аспекты Штормграда». Обновлён под baseline v0.3 (glory 25, Despair off, мгновенная alt-victory, замена со скидкой). **Изменения v0.3.1:** расширен `card-stats` (флаги `--all`, `--card`, `--sort`, `--min-samples`), починен `shield_blocked` в `attack-efficiency`.

---

## Содержание

1. [Зачем это нужно](#1-зачем-это-нужно)
2. [Концептуальная модель](#2-концептуальная-модель)
3. [Архитектура и установка](#3-архитектура-и-установка)
4. [Runner API — фундамент](#4-runner-api--фундамент)
5. [Группа 1: Диагностика](#5-группа-1-диагностика)
6. [Группа 2: Базовые симуляции](#6-группа-2-базовые-симуляции)
7. [Группа 3: Анализ карт и колод](#7-группа-3-анализ-карт-и-колод)
8. [Группа 4: Анализ меты](#8-группа-4-анализ-меты)
9. [Группа 5: Pace, бой и структура партии](#9-группа-5-pace-бой-и-структура-партии)
10. [Группа 6: Поиск колод](#10-группа-6-поиск-колод)
11. [Группа 7: Замена](#11-группа-7-замена)
12. [Группа 8: Долгие партии](#12-группа-8-долгие-партии)
13. [Методология и интерпретация](#13-методология-и-интерпретация)
14. [Типичные сценарии](#14-типичные-сценарии)
15. [Troubleshooting](#15-troubleshooting)

---

## 1. Зачем это нужно

Движок «Аспектов» — **детерминированная система**: `createGame(seed)` + команды → `GameState`. Боты играют по правилам и принимают решения локально. Это значит, что любую партию можно **воспроизвести** и **проанализировать**.

`@aspects/simtools` — слой поверх движка и ботов, который:
- прогоняет **сотни партий** и собирает статистику;
- **сравнивает** ботов, колоды, карты;
- **детектирует** проблемы баланса, pace, AI;
- **ищет** оптимальные колоды генетическим алгоритмом.

**Чего эти инструменты НЕ делают:**
- Не играют «по-честному» в реальном времени (только симуляция).
- Не заменяют playtest с живыми людьми. Это инструменты **диагностики**, не **балансировки**.

### Baseline v0.3 (на момент обновления)

| Метрика | Значение |
|---|---|
| Mean turns | 24.3 |
| Median turns | 22 |
| Хвост 45+ | 2.7% |
| Hand bloat (late) | 7.37 |
| Alt-victory | 12.5% |
| Suicide | 0% |
| Died 1-turn | 19.6% |

**Правила:** glory 25, Despair off, alt-victory мгновенная, underdog-draw off, замена со скидкой.

---

## 2. Концептуальная модель

Три ключевых понятия, без которых не работают инструменты:

### 2.1. Series (серия)

**Серия** — единица релиза контента. Идентификатор — `meta.id` в `data/packs/<dir>/meta.json`. Примеры: `classic`, `stormwind`, `throne`.

Карта принадлежит **одной или нескольким сериям** (при рестайле).

Папка на диске ≠ `meta.id` (например, `old_stormwind/` содержит `id: "ash_stormwind"`).

### 2.2. Scope (набор серий)

**Scope** — набор серий, в рамках которого допустимо колодостроение. Определён в `packages/cards/src/scopes.ts`.

| Scope | Серии | Назначение |
|---|---|---|
| `main` ★ | `classic`, `cradle`, `inner`, `throne`, `integration`, `cathedral` | Основная игра, фокус баланса |
| `ashenlight` | `stormwind`, `voidflame`, `forsaken`, `apocryph` | Legacy-пак 1 |
| `oskol` | `perimeter`, `echo`, `razlom`, `sky` | Legacy-пак 2 |

Колода должна целиком лежать в одном scope. Кросс-scope колоды — **ошибка**.

Можно передавать **явный список серий** через запятую: `classic,throne` — для экспериментальных scope'ов.

### 2.3. Preset (пресет)

**Пресет** — готовая колода (30 карт), лежит в `data/presets.json`. Идентификатор — `preset.id` (например, `strazha`).

Пресет **может** быть в нескольких scope'ах, если его карты подходят.

### 2.4. Bot (бот)

Боты живут в `@aspects/bot`. Их 36 штук:
- 6 профилей: `balanced`, `aggro`, `defensive`, `control`, `opportunist`, `berserker`
- 6 уровней: `rookie`, `novice`, `regular`, `veteran`, `master`, `grandmaster`

Идентификатор: `heuristic-v5-<profile>-<level>`.

Профиль — это веса оценки. Уровень — вероятность ошибки (`mistakeRate`).

**Важно (v0.3):** `v5Lookahead` и `v5AltVictory` в HeuristicBot **выключены** — тесты показали ухудшение.

---

## 3. Архитектура и установка

### 3.1. Где живёт

```
packages/simtools/
├── src/                     # библиотечный код (экспортируется)
│   ├── index.ts
│   ├── types.ts             # интерфейсы
│   ├── bots.ts              # реэкспорт из @aspects/bot
│   └── runner.ts            # runOneGame, runOneGameRaw, runSeries
└── scripts/                 # CLI-инструменты
```

### 3.2. Зависимости

`@aspects/simtools` → `@aspects/engine`, `@aspects/cards`, `@aspects/bot`.

Обратных зависимостей нет.

### 3.3. Установка и сборка

```bash
pnpm install                         # если менялись package.json
pnpm --filter @aspects/simtools build
```

### 3.4. Запуск

```bash
pnpm run --filter @aspects/simtools <команда> [args]
```

**Тонкость:** `pnpm run --filter X list` работает, но `pnpm --filter X list` — нет (встроенная `list` перехватывает). Всегда `pnpm run` для наших скриптов.

### 3.5. Список инструментов (21)

| Скрипт | Группа | Приоритет |
|---|---|---|
| `list` | Диагностика | 🔴 |
| `trace` | Диагностика | 🔴 |
| `dump-state` | Диагностика | 🟡 |
| `simulate` | Симуляции | 🟡 |
| `matrix` | Симуляции | 🔴 |
| `duel` | Симуляции | 🔴 |
| `first-player` | Симуляции | 🟡 |
| `matchup-heatmap` | Симуляции | 🟢 |
| `card-stats` | Карты | 🔴 |
| `deck-diff` | Карты | 🟢 |
| `keyword-stats` | Карты | 🟢 |
| `meta-report` | Мета | 🟡 |
| `turn-outcome` | Мета | 🟡 |
| `pace-report` | Pace | 🔴 |
| `attack-efficiency` | Pace | 🔴 |
| `combat-efficiency` | Pace | 🟡 |
| `board-state-timeline` | Pace | 🟢 |
| `missed-lethal` | Pace | 🟢 |
| `replacement-analysis` | Замена | 🔴 |
| `find-long-games` | Долгие партии | 🟡 |
| `deck-optimizer` | Поиск колод | 🟡 |

---

## 4. Runner API — фундамент

Все CLI-скрипты используют общий слой `runner.ts`. Если пишешь новый инструмент — работаешь через него, а не дёргаешь `createGame` напрямую.

### 4.1. `resolveDeck(series, deckId)`

Находит пресет по id в рамках scope. Бросает ошибку, если пресета нет.

```ts
const deck = resolveDeck(['classic', 'throne'], 'strazha');
// → DeckPreset { id, name, cards: string[] }
```

### 4.2. `pickResponder(state)`

Определяет, кто должен отвечать командой в текущем состоянии:
- при `pendingChoice` — игрок, которому адресован выбор;
- в `MULLIGAN` — по очереди `p1`, потом `p2`;
- иначе — активный игрок;
- `null` — если партия завершена или нечего делать.

### 4.3. `runOneGame(series, p1DeckId, p2DeckId, seed, opts)`

Одна партия между **пресетами**.

```ts
interface RunOptions {
  bots: { p1: Bot; p2: Bot };
  useMulligan?: boolean;    // default false
  maxSteps?: number;        // default 20_000
  onAfterCommand?: (state: GameState, cmd: Command, events: GameEvent[]) => void;
}

const r = runOneGame(['classic'], 'strazha', 'divan', 'seed-1', {
  bots: { p1: makeBot('heuristic-v5-balanced-master'),
          p2: makeBot('heuristic-v5-aggro-master') },
  useMulligan: true,
});
// → { winner, winnerReason, turns, steps, hitLimit, finalState }
```

**Ключевое:** `onAfterCommand` вызывается **после** каждой применённой команды. Используется для сбора метрик (pace-report, combat-efficiency, replacement-analysis).

### 4.4. `runOneGameRaw(series, p1Cards, p2Cards, seed, opts)`

То же самое, но принимает **массивы card ids**, не пресеты. Нужен для:
- `deck-optimizer` — у него нет пресетов;
- `keyword-stats` — оппоненты — геномы;
- любые эксперименты с «нестандартными» колодами.

### 4.5. `runSeries(opts)`

Серия партий между двумя пресетами. Возвращает агрегат:

```ts
interface RunSeriesOptions {
  series: string[];
  p1DeckId: string;
  p2DeckId: string;
  games: number;
  useMulligan?: boolean;
  botFactories?: { p1: () => Bot; p2: () => Bot };
  maxSteps?: number;
}

const r = runSeries({
  series: ['classic'],
  p1DeckId: 'strazha',
  p2DeckId: 'divan',
  games: 100,
  botFactories: { p1: () => makeBot('...'), p2: () => makeBot('...') },
});
// → { games, p1Wins, p2Wins, draws, avgTurns, avgSteps,
//     reasons: { glory_zero: N, alt_victory: M },
//     hitLimitCount, elapsedMs }
```

**Ключевое:** `botFactories` — фабрики, не инстансы. Каждая партия создаёт свежих ботов. Это **критично** — боты stateful, переиспользование ломает детерминизм.

---

## 5. Группа 1: Диагностика

Три инструмента для быстрого ответа «что у нас есть».

### 5.1. `list` — что в системе

```bash
pnpm run --filter @aspects/simtools list                # все scope + пресеты + боты
pnpm run --filter @aspects/simtools list main           # детали по scope
pnpm run --filter @aspects/simtools list main strazha   # карты колоды
```

**Что показывает:**
- Все scope с маркером `★` на `main`
- Серии в каждом scope
- Пресеты, доступные в scope
- Все доступные id ботов

**Когда использовать:** перед любым прогоном — чтобы не передать несуществующий `deckId` или `botName`.

### 5.2. `trace` — пошаговая трассировка

```bash
pnpm run --filter @aspects/simtools trace main strazha divan test-seed-1 heuristic-v5-balanced-master
```

**Что делает:** играет одну партию и выводит **каждую команду** с состоянием до/после. Указывает `✗REJECTED`, если команда отклонена.

**Формат вывода:**
```
── Initial: turn=1 phase=RESTORE active=p1 glory=25/25 inf=0 hand=4 | ...
[0] p1: {"type":"ADVANCE_PHASE","playerId":"p1"}
     → turn=1 phase=PLAY active=p1 glory=25/25 inf=1 hand=5 | ...
[1] p1: {"type":"PLAY_CARD","playerId":"p1","cardId":"c3","column":1}
     → turn=1 phase=PLAY active=p1 glory=25/25 inf=0 hand=4 | front p1=[Кукла(0) . . . .] ...
...
── End: winner=p2 reason=glory_zero steps=125
```

**Когда использовать:**
- Найти, на каком шаге бот принял плохое решение
- Понять, почему партия затянулась
- Дебажить конкретный seed

**Совет:** перенаправляй в файл, если партия длинная:
```bash
pnpm run --filter @aspects/simtools trace ... > trace.log
```

### 5.3. `dump-state` — дамп JSON

```bash
pnpm run --filter @aspects/simtools dump-state main strazha divan 50 heuristic-v5-balanced-master state.json
```

**Что делает:** играет N команд и сохраняет `GameState` в JSON.

**Когда использовать:**
- Создать фикстуру для теста
- Сравнить два прогона на бинарном уровне
- Понять «что за состояние на ходу 50»

---

## 6. Группа 2: Базовые симуляции

### 6.1. `simulate` — серия между двумя колодами

```bash
pnpm run --filter @aspects/simtools simulate main strazha divan 100
```

**Параметры:**
- `<scope>` — имя scope или серии через запятую
- `<p1DeckId>`, `<p2DeckId>` — id пресетов
- `<N>` — партий
- `--mulligan` — включить муллиган

**Что выводит:** winrate P1/P2, средние turns, reasons, время.

**Когда использовать:** проверить одну конкретную пару, посмотреть базовые метрики.

### 6.2. `matrix` — матрица N×N

```bash
pnpm run --filter @aspects/simtools matrix main 50
pnpm run --filter @aspects/simtools matrix main 50 heuristic-v5-balanced-master strazha,divan
```

**Параметры:**
- `<scope>` — обязателен
- `<N>` — партий на пару (не на весь матрикс!)
- `[botName]` — опционально, default `heuristic-v5-balanced-master`
- `[deck1,deck2,...]` — ограничить набор колод
- `--mulligan`

**Что выводит:** матрицу winrate (P1 perspective). Каждая клетка — `XX% (YYt)`.

**Плюс проверка симметрии:**
```
Симметрия пар (ожидание ≈100%):
  strazha vs divan          102%
  strazha vs partizany       88%  ⚠
```

`88%` означает, что strazha выигрывает у partizany 46%, а partizany у strazha 42% — асимметрия. Может быть шум (при N=50 SE≈7%), может быть реальная.

**Когда использовать:**
- Оценить баланс пресетов
- Найти доминирующую колоду
- Проверить, что матчапы симметричны

### 6.3. `duel` — A/B-тест двух ботов

```bash
pnpm run --filter @aspects/simtools duel main 20 heuristic-v5-balanced-master heuristic-v5-aggro-master strazha,divan
```

**Параметры:** `<scope>`, `<N>`, `<botA>`, `<botB>`, `[deck1,deck2,...]`, `--mulligan`.

**Методология:** для каждой пары колод играются **две зеркальные серии** (`A@p1 vs B@p2`, `B@p1 vs A@p2`). Преимущество первого хода и перекос колод взаимно уничтожаются. Остаётся чистая разница силы ботов.

**z-статистика** — критична. Если `|z| < 1.96` — разница не значима на уровне p=0.05.

**Когда использовать:**
- Сравнить два профиля ботов
- Проверить, помогает ли новая фича бота
- Калибровать `mistakeRate` уровней

### 6.4. `first-player` — first-mover advantage

```bash
pnpm run --filter @aspects/simtools first-player main 200
```

**Что делает:** для каждой колоды играет `N` mirror-партий. Считает **чистое преимущество первого хода**.

**Что выводит:** winrate по сторонам, advantage в пп, z-статистику.

**Интерпретация:**
- `Advantage ≈ 0` — first-mover отсутствует (норма)
- `Advantage > 3 пп` (z > 1.96) — есть реальное преимущество, надо компенсировать второму игроку
- `Advantage < -3 пп` — наоборот (баг или особая механика)

**Когда использовать:** раз в итерацию правил — проверить, не появилось ли преимущество.

### 6.5. `matchup-heatmap` — визуальная матрица

```bash
pnpm run --filter @aspects/simtools matchup-heatmap main 50
```

**Отличие от `matrix`:** ANSI-цвета.
- 🟢 зелёный — P1 выигрывает >60%
- 🟡 жёлтый — 40-60%
- 🔴 красный — <40%

**Когда использовать:** быстро окинуть взглядом 5×5+ матрицу.

---

## 7. Группа 3: Анализ карт и колод

### 7.1. `card-stats` — Δ-метрика по картам

```bash
pnpm run --filter @aspects/simtools card-stats main 50
```

**Методология.** Для каждой карты считается два числа:
- `wr_play` — winrate партий, где карта **была разыграна**;
- `wr_no_play` — winrate партий, где карта **была в руке, но не разыграна**.

**Δ = wr_play − wr_no_play.**

Это устраняет базовый winrate колоды и отвечает: **«играть карту — лучше, чем не играть?»**

#### Флаги (v0.3.1)

```bash
pnpm run --filter @aspects/simtools card-stats main 100 [flags]
```

| Флаг | Что делает |
|---|---|
| `--all` | Вывести **полный список** всех карт (не только top/bottom 15) |
| `--card <id\|name>` | Детали по **конкретной карте** (по id или по имени) |
| `--sort <field>` | Сортировка: `delta` (default) \| `playRate` \| `cost` \| `medianTurn` \| `drawn` \| `played` |
| `--min-samples N` | Порог сэмплов (default 20). `--min-samples 5` покажет карты с 5 сэмплами |
| `--mulligan` | Включить муллиган |

#### Примеры

**Полный список всех карт:**

```bash
pnpm run --filter @aspects/simtools card-stats main 100 --all
pnpm run --filter @aspects/simtools card-stats main 100 --all > card-stats-all.txt
```

Выводит top-15, bottom-15, dead, потом **все карты** (обычно ~80-150 строк). С `--all` удобно грепать: `grep "Ворчун" card-stats-all.txt`.

**Детали конкретной карты:**

```bash
pnpm run --filter @aspects/simtools card-stats main 100 --card classic_hacker
pnpm run --filter @aspects/simtools card-stats main 100 --card "Ростовчанин"
```

Если карта набрала сэмплов — выводит полную статистику:

```
─── Детали карты: classic_hacker ──────

  ┌─ Ростовчанин
  │  id:          classic_hacker
  │  cost:        3
  │  drawn:       566
  │  played:      362
  │  playRate:    64.0%
  │  medianTurn:  18
  │  wr_play:     71.0%
  │  wr_no:       13.2%
  │  Δ:           +57.8pp
  └─
```

Если карта не набрала `minSamples` — выводит `drawn/played` и подсказку:

```
⚠ Ростовчанин (classic_hacker): недостаточно сэмплов.
  drawn: 15, played: 8
  minSamples=20. Попробуй --min-samples 8
```

Если карта вообще **не была в руке ни разу** — сообщает:

```
⚠ Имя (id): ни разу не была в руке за 2500 партий.
  Карта существует, но её нет в пресетах scope.
```

**Сортировка по популярности:**

```bash
pnpm run --filter @aspects/simtools card-stats main 100 --all --sort played
```

Сначала — самые играемые карты. Полезно для ревизии контента.

**Сортировка по мёртвости:**

```bash
pnpm run --filter @aspects/simtools card-stats main 100 --all --sort playRate
```

Сначала — карты, которые редко играются.

**С низким порогом сэмплов:**

```bash
pnpm run --filter @aspects/simtools card-stats main 100 --all --min-samples 5
```

Увидишь даже карты с 5 сэмплами.

#### Что выводит (summary mode)

```
─── Топ 15 «ценных» карт (Δ > 0) ──────────────
card                       cost  drawn played  pRate  medT  wr_play  wr_no         Δ
Ростовчанин                   3    566    362  64.0%    18  71.0%  13.2%   +57.8pp
...
─── Топ 15 «проблемных» карт (Δ < 0) ──────────
...
─── «Мёртвый груз» (playRate < 15%) ───────────
Ворчун                        4    569     75  13.2%  23.5  72.0%  46.0%   +26.0pp

💡 Полный список (N карт): добавь --all
   Детали карты: --card <id|name>
   Другая сортировка: --sort playRate | cost | medianTurn | drawn | played
```

**Колонки:** cost, drawn, played, pRate (доля разыгрывания), medT (медианный ход), wr_play, wr_no, Δ.

**Интерпретация Δ:**
- `Δ > +8pp` — сильный сигнал «карта ценна»
- `Δ +3..+8pp` — умеренный
- `Δ −3..+3pp` — в пределах шума
- `Δ −8..−3pp` — чаще играется в проигранных партиях
- `Δ < −8pp` — устойчивая корреляция с поражениями

**Интерпретация playRate:**
- `< 15%` — «мёртвый груз»
- `15-50%` — ситуативная
- `> 50%` — «must-play»

**Крайне важно:** Δ — **корреляция, не причинность**. Win-more карты имеют высокий Δ автоматически. Comeback-карты — низкий.

**Когда использовать:**
- После добавления новых карт — проверить, играются ли они
- Найти «мёртвый груз» для ревизии контента
- Разобрать одну конкретную карту, которая «кажется хорошей, но не играется»

### 7.2. `deck-diff` — сравнение двух колод

```bash
pnpm run --filter @aspects/simtools deck-diff main strazha divan
```

**Что выводит:**
- Средние метрики: avg cost, avg strength, avg health
- Cost-кривые
- Распределение keywords
- Карты только в одной колоде

**Когда использовать:**
- Дизайн нового пресета — сравнить с существующим
- Понять, чем колоды отличаются стратегически

### 7.3. `keyword-stats` — winrate по keywords

```bash
pnpm run --filter @aspects/simtools keyword-stats main 50
```

**Методология.** Собираем keywords каждой колоды. Для каждого keyword считаем:
- `withWr` — winrate колод, где keyword есть
- `withoutWr` — winrate колод, где keyword нет
- `Δ` — разница

**Осторожно:** если все колоды с keyword'ом сильно похожи, Δ показывает не «сила keyword», а «сила колоды с ним».

**Когда использовать:** когда есть **разные** колоды с разными keywords. На текущих 3 колодах сигнала нет.

---

## 8. Группа 4: Анализ меты

### 8.1. `meta-report` — агрегат по пресетам и сериям

```bash
pnpm run --filter @aspects/simtools meta-report main 50
```

**Что делает.** Для каждой пары пресетов `(A, B)` играет `N` партий. Собирает winrate каждой колоды **в среднем по всем матчапам**.

**Что выводит:**
```
─── Winrate по колодам ────────────────────────
deck          games  wins   wr      avgT  series
strazha       300    161    53.7%   27.6  [classic]
...
─── Winrate серий ─────────────────────────────
  classic        900     50.0%
─── Причины побед (общие) ─────────────────────
  glory_zero       840     (93.3%)
```

**Когда использовать:**
- Раз в итерацию баланса — общая картина меты
- Понять, какая колода доминирует

### 8.2. `turn-outcome` — winrate по длине партии

```bash
pnpm run --filter @aspects/simtools turn-outcome main 50
```

**Что делает.** Играет партии, разбивает их по бакетам длины (`10-14`, `15-19`, ..., `45-60`). Для каждого бакета считает: games, p1_wr, avg_winner_glory, avg_loser_glory, распределение причин.

**Что выводит:**
```
turns     games   p1_wr   avg_winner_glory  avg_loser_glory   reasons
15–19     540     52.8%   23.2              2.7               glory_zero:427 alt_victory:113
20–24     631     51.3%   22.7              1.9               glory_zero:510 alt_victory:121
...
45–60     57      47.4%   10.8              0.0               glory_zero:57
```

**Ключевые сигналы:**
- `avg_loser_glory` ≈ 0 → партии заканчиваются полным уничтожением
- `avg_winner_glory` падает с длиной → долгие партии — взаимное истощение
- `p1_wr` скачет → структура правил, не баланс карт

**Когда использовать:**
- Диагностика pace — есть ли «застревающие» бакеты
- Проверка гипотезы «P1 имеет преимущество в определённом диапазоне»

---

## 9. Группа 5: Pace, бой и структура партии

Пять инструментов, которые отвечают на вопросы **«почему партия идёт так долго»** и **«что происходит на доске»**.

### 9.1. `pace-report` — pace-анализ

```bash
pnpm run --filter @aspects/simtools pace-report main 100
```

**Что делает.** Играет `N` партий, собирает через `onAfterCommand` метрики по ходу партии.

**Что выводит 10 блоков:**

**1. Длина партии** — mean, median, гистограмма по бакетам (bucket = 5).

**2. Стоимость разыгранных карт** — распределение cost (0..10), avg, median, доли дешёвых/средних/дорогих.

**3. Средний cost по ходам** — 1-5, 6-10, ..., 26-30.

Если растёт медленно — экономика не даёт играть дорого. Если плавно до 4-5 — работает.

**4. Средний размер руки** — по бакетам ходов.

Если рука растёт к 9-10 — бот не может «сбросить» накопленное. Если стабильно 4-6 — всё ок.

**5. Неистраченное влияние** — распределение в конце PLAY.

Если 0-1 — влияние тратится полностью. Если 4-6 — не может потратить, что копит.

**6. Underdog триггеры** (новое в v0.3) — сколько раз сработал underdog-draw и underdog-influence.

`Underdog-draw triggers: 0%` — отключён (v0.3). `Underdog-influence triggers: 33%` — работает.

**7. Idle-ходы** — сколько ходов без PLAY_CARD / ATTACK / USE_ABILITY.

**8. Карты, умершие в течение 1 хода** — процент «карты входят и сразу умирают».

**9. Вехи партии** — первый розыгрыш, первая смерть, первый захват нейтрала, первое падение glory <20, <10.

**10. Причины завершения и нейтралы к концу.**

**Что реально показали текущие данные (v0.3):**
- Mean turns **24.3**, median **22**
- Рука к концу **7.37** (было 10.19 до v0.3)
- Cost по ходам 1.50 → 2.44
- Первая смерть на ходу 5.4, glory <20 на 11.6, glory <10 на 20.0

### 9.2. `attack-efficiency` — куда уходят атаки

```bash
pnpm run --filter @aspects/simtools attack-efficiency main 100
```

**Что делает.** Играет `N` партий, для каждой `ATTACK`-команды классифицирует исход:
- **`guild_direct`** — атака по гильдии (фронт пуст)
- **`guild_intercepted`** — атака по гильдии через interceptor (**откачено в v0.3**, показывает 0)
- **`neutral`** — атака по нейтралу
- **`kill`** — защитник умер, атакующий жив
- **`trade`** — оба умерли
- **`chip`** — оба выжили (без учёта щитов)
- **`suicide`** — атакующий умер, защитник выжил
- **`shield_blocked`** — щит поглотил весь урон (событие `SHIELD_ABSORBED`)

**Что выводит:**
```
─── Распределение атак по категориям ──────────
  Всего атак:        97700
  По гильдии (direct):      33026  (33.8%)
  По нейтралам:             26530  (27.2%)
  Убийство (kill):          29876  (30.6%)
  Размен (trade):           6469   (6.6%)
  Чип (chip):               1778   (1.8%)
  Суицид (suicide):         21     (0.0%)
  Поглощён щитом:           0      (0.0%)
─── Урон по гильдии ───────────────────────────
  Средний удар (direct):      2.60
```

**Ключевые метрики:**
- **`chip > 40%`** — большинство атак не решают судьбу защитника. Attrition.
- **`kill + trade < 30%`** — большинство атак нерезультативны.
- **`suicide > 10%`** — бот плохо оценивает размен.
- **`neutral > 30%`** — бот переоценивает клетки.
- **`shield_blocked > 5%`** — щиты реально поглощают атаки. Проверить, что `scoreAttackHeur` бота их обходит (`preview.shieldBlocks`).

**Примечание v0.3.1:** `shield_blocked` теперь **работает** — раньше он всегда был 0% из-за бага в классификаторе (щит-атаки попадали в `chip`/`suicide`). Теперь через `events.some(e => e.type === 'SHIELD_ABSORBED')`. Если `shield_blocked = 0%` — значит щиты в текущих пресетах либо не атакуются (бот обходит), либо вообще отсутствуют в колодах.

**Как проверить, есть ли щиты в колодах:**

```bash
pnpm run --filter @aspects/simtools deck-diff main strazha divan
```

В разделе `─── Keywords ──────` увидишь, какие keywords есть в колодах.

**Примечание про `guild_intercepted`:** с v0.3 механика откачена. Поле осталось для совместимости, всегда 0. Не пугайся.

### 9.3. `combat-efficiency` — эффективность боя

```bash
pnpm run --filter @aspects/simtools combat-efficiency main 100
```

**Что делает.** Играет `N` партий, для каждой сыгранной карты отслеживает:
- Когда разыграна, когда умерла
- Сколько атак сделала
- По кому атаковала

**Что выводит:**

**Сводка:** cards played, cards died.

**Судьба карт:**
- Умерли без единой атаки (%)
- Атак на карту в среднем
- Медианная / средняя жизнь (в ходах)

**Куда бьют:** % атак по картам / гильдии / нейтралам.

**Атаки по фазам COMBAT:** total phases, phases без атак, атак за партию, первая атака.

**Интерпретация:**
- `died_without_attack > 40%` — attrition-паты
- `died_without_attack > 25%` — на грани
- `attacks_per_life < 1` — карта не окупает розыгрыш
- `median_lifespan < 2` — карты почти не живут
- `face_share > 60%` — rushят
- `face_share < 30%` — не понимают, когда закрывать
- `phase_with_attack < 50%` — половина COMBAT-фаз пустые

**Что реально показали данные (v0.3):**
- 25k карт сыграно за 900 партий
- 26.5% умирают без атак
- 1.42 атаки на карту
- Медианная жизнь 3 хода
- Face share 32% — balance

### 9.4. `board-state-timeline` — динамика доски

```bash
pnpm run --filter @aspects/simtools board-state-timeline main 100
```

**Что делает.** Играет `N` партий, на каждом ходу снимок доски. Группирует по бакетам ходов.

**Что выводит:**
```
─── Средний размер фронта по ходам ────────────
turns     p1_front  p2_front  p1_res  p2_res  p1_str  p2_str  samples
1–3       0.45      0.50      0.30    0.28    1.0     1.1     387
7–9       2.71      2.68      1.55    1.60    6.3     6.1     1541
28–30     4.21      4.18      2.40    2.50    10.5    10.2    105
```

**Интерпретация:**
- `Фронт занят 4-5 в >60% случаев` — «стены». Attrition.
- `30-60%` — смешанная картина
- `<30%` — карт не хватает

**Когда использовать:** подтвердить/опровергнуть гипотезу «фронт стоит».

### 9.5. `missed-lethal` — детектор упущенных леталов

```bash
pnpm run --filter @aspects/simtools missed-lethal main 100
```

**Методология.** На **начало каждой COMBAT-фазы** проверяем:
- Фронт оппонента пуст
- Суммарная сила неистощённых юнитов ≥ glory оппонента
- Glory оппонента > 0

Если все три — это **летальный ход**. Если фаза закончилась, а glory оппонента всё ещё > 0 — это **missed lethal**.

**Что выводит:** lethal turns, missed lethal, miss rate, первые 20 ситуаций.

**Интерпретация:**
- `Lethal turns = 0` — игра не доходит до состояния добивания
- `Miss rate = 0%` — бот идеален
- `Miss rate > 5%` — AI-баг, смотрим trace

---

## 10. Группа 6: Поиск колод

### 10.1. `deck-optimizer` — генетический поиск

```bash
pnpm run --filter @aspects/simtools deck-optimizer main --out best-decks.json
```

**Параметры:**
- `<scope>` — обязателен
- `--pop N` — размер популяции (default 12)
- `--gen N` — число поколений (default 12)
- `--eval N` — партий на оценку особи (default 30)
- `--elite N` — размер элиты (default 2)
- `--bot NAME` — бот (default `heuristic-v5-balanced-master`)
- `--seed STR` — seed для воспроизводимости
- `--out FILE` — сохранить топ-колоды в JSON

**Методология.**

1. **Инициализация.** `pop` случайных колод с дедупликацией. Каждая валидируется: 30 карт, ≤4 серий, ≤5 копий Личности, ≤2 копий Аспекта, ≤1 легендарки.

2. **Оценка.** Для каждой особи — winrate против **смеси**: всех базовых пресетов scope'а + top-2 из прошлой генерации (co-evolution).

3. **Селекция.** Топ-`elite` + 2 случайных из середины (разнообразие).

4. **Репродукция.** Crossover + mutation (15%).

5. **Финальная проверка.** Топ-5 переоцениваются на **100 партиях** против **всех** базовых пресетов.

**Что выводит:**
```
Gen  1/12: best=70.0% avg=36.7% worst=20.0% (27s)
...
Gen 12/12: best=72.0% avg=48.2% worst=30.0% (800s)
─── Топ-5 колод (финальная оценка) ────────────
#1  winrate=62.3%  series=[classic, cradle, inner, throne]
   cost: 1💰×4 2💰×5 3💰×13 4💰×6 5💰×1 6💰×1
   1× Бюрократ (3💰)
   ...
```

**Ключевые моменты:**
- `best` может скакать из-за шума. Смотри на `avg`, не на `best`
- **Финальная оценка важнее промежуточной.** Если best был 70%, а финальный 62% — overfit на co-evolution
- **Cost curve топа** — ответ на «можно ли играть дорогие карты»
- **Дедупликация через signature** — если генерация не может набрать `pop` уникальных, уменьши `--pop`

**Производительность:** дефолты = 12×12×30 + 10×100 = 5320 партий ≈ 21 минута. Быстрая версия `--pop 8 --gen 6 --eval 20` ≈ 2 минуты.

**Ограничение:** оптимизатор ищет «колоду против бота-мастера», не «колоду против живого игрока». Результаты — **сигнал**, не «оптимальная колода».

---

## 11. Группа 7: Замена

### 11.1. `replacement-analysis` — анализ замен

```bash
pnpm run --filter @aspects/simtools replacement-analysis main 100
```

**Что делает.** Играет `N` партий. Для каждой команды проверяет:
- Была ли **доступна** замена
- Была ли замена **совершена**
- Что именно менялось

**Важно (v0.3):** ищет `CARD_REPLACED` в событиях **любой** команды, не только `REPLACE_CARD`. В новой архитектуре замена идёт в **две** команды: `REPLACE_CARD` ставит `pendingChoice`, `RESOLVE_CHOICE` применяет `CARD_REPLACED`.

**Что выводит:**
```
─── Сводка ────────────────────────────────────
  Games:                            2500
  Games with replacement available: 2479 (99.2%)
  Games with replacement made:      2179 (87.2%)
  Total opportunities:              22822  (9.13/партия)
  Total replacements:               5870  (2.35/партия)
  Utilization rate:                 25.7%
─── Партии с заменой ─────────────────────────
  Games with replacement:  2179
  Wins by replacer:        583 (26.8%)
```

**Ключевые метрики:**
- **`Utilization`** — доля замен от доступных ситуаций. `<10%` — мёртвая, `10-15%` — ситуативная, `>20%` — нормальная.
- **`Wins by replacer`** — winrate стороны, сделавшей замену. `>45%` — замена полезна.

**Ограничение v0.3:** в текущих пресетах у каждого `personalityTag` **один вариант карты**. Cross-aspect upgrade невозможен. Потолок utilization ≈ 12.5% без cross-variant контента.

---

## 12. Группа 8: Долгие партии

### 12.1. `find-long-games` — поиск долгих партий

```bash
pnpm run --filter @aspects/simtools find-long-games main 100
pnpm run --filter @aspects/simtools find-long-games main 100 heuristic-v5-balanced-master 40
```

**Параметры:** `<scope>`, `<N>`, `[botName]`, `[threshold]` (default 45), `--mulligan`.

**Что делает.** Ищет партии длиннее `threshold`. Для каждой сохраняет seed + метрики финального состояния. Отдельно — **«stuck state»**: сколько ходов прошло с последнего изменения glory.

**Что выводит:**
```
─── Сводка ────────────────────────────────────
  Всего партий:        2500
  Длинных (>45):      68  (2.7%)
─── Распределение длинных ─────────────────────
  Turns:          mean=51.0  median=51  max=62
  Stuck turns:    mean=0.0  median=0
  Winner glory:   mean=10.8
  Loser glory:    mean=0.2
─── Топ-10 самых длинных (для trace) ─────────
turns stuck glory       winner  decks                           seed
62    0     0/3         p2      strazha vs strazha              flg-strazha-strazha-42
...
```

**Ключевые метрики:**
- **`Stuck turns`** — если > 10 — игра застряла. Если ≈ 0 — mutual attrition (glory меняется, но медленно).
- **`Winner glory`** — высокий = доминирование без закрытия. Низкий = оба вымотаны.
- **`Топ-10 seeds`** — для trace.

**Когда использовать:**
- Понять, почему есть длинные партии
- Найти seed для trace

---

## 13. Методология и интерпретация

### 13.1. Детерминизм

Движок детерминирован: `createGame(seed)` + команды → `GameState`. Значит:
- Одинаковый `seed` → одинаковая партия
- **Разные seeds в серии** — обязательны для статистики
- `runSeries` генерирует seeds `${series.join('+')}-${p1}-${p2}-${i}`

### 13.2. Детерминизм ботов

Боты stateful, но детерминированные. Внутри `HeuristicBot` — seeded RNG, никаких `Math.random()`.

**Важно:** создавай **новых ботов** на каждую партию через `botFactories`.

### 13.3. Статистическая значимость

- `N < 30` — не значимо, только smoke-test
- `N = 50` — грубая картина, SE winrate ≈ 7pp
- `N = 100` — норм, SE ≈ 5pp
- `N = 200` — хорошо, SE ≈ 3.5pp
- `N = 500` — уверенно, SE ≈ 2pp

**z-статистика** — всегда смотри. `|z| < 1.96` = p > 0.05 = **не значимо**.

### 13.4. Корреляция vs причинность

`card-stats`, `keyword-stats`, `deck-optimizer` — **корреляционные**:
- Win-more карты имеют высокий Δ автоматически
- Comeback-карты — низкий
- Сильные карты, которые не влезают в колоду (cost 5+) — низкий playRate, средний Δ

### 13.5. Что важно смотреть в первую очередь

**Для баланса карт:**
1. `card-stats` — Δ и playRate
2. `deck-diff` — сравнить с существующим
3. `card-stats --card <id>` — детали конкретной карты

**Для pace:**
1. `pace-report` — длина, cost, рука, влияние
2. `attack-efficiency` — куда уходят атаки
3. `combat-efficiency` — attrition vs tempo
4. `board-state-timeline` — заполненность фронта
5. `missed-lethal` — AI-баги
6. `find-long-games` — долгие партии

**Для меты:**
1. `meta-report` — общая картина
2. `matrix` / `matchup-heatmap` — матчапы
3. `turn-outcome` — как заканчиваются

**Для AI:**
1. `duel` — сравнить ботов
2. `missed-lethal` — AI-баги
3. `first-player` — bias
4. `attack-efficiency` — `shield_blocked` (обходит ли бот щиты?)

**Для замены:**
1. `replacement-analysis` — utilization, wins by replacer

---

## 14. Типичные сценарии

### 14.1. «Я добавил 5 новых карт. Как проверить?»

1. `pnpm --filter @aspects/cards build` — пересобрать
2. `pnpm --filter @aspects/cards validate` — проверить данные
3. `pnpm run --filter @aspects/simtools list main <deck>` — убедиться, что новые карты попали в пресет
4. `pnpm run --filter @aspects/simtools deck-diff main <old> <new>` — сравнить cost-кривые
5. `pnpm run --filter @aspects/simtools card-stats main 100` — есть ли playRate > 15%
6. `pnpm run --filter @aspects/simtools card-stats main 100 --card <new_id>` — детали конкретной карты
7. `pnpm run --filter @aspects/simtools meta-report main 100` — общий winrate не сломался

### 14.2. «Хочу понять, почему игра затянута»

1. `pace-report main 100` — сигналы (рука растёт, cost медленно, влияние не тратится)
2. `combat-efficiency main 100` — attrition? face share?
3. `find-long-games main 100` — есть ли stuck state?
4. `turn-outcome main 100` — как распределена длина
5. Trace длинной партии из `find-long-games`

### 14.3. «Хочу сравнить двух ботов»

1. `duel main 50 <botA> <botB>` — z-статистика
2. Если z значим — бот A сильнее
3. Если не значим — увеличь N

### 14.4. «Хочу найти новую колоду»

1. `deck-optimizer main --pop 12 --gen 10 --eval 30`
2. Смотрим топ-5: cost-curve, карты
3. Если финальный winrate < 55% — оптимизатор ничего не нашёл
4. Если > 65% — потенциальная доминирующая колода

### 14.5. «Нужно проверить, что first-player не сломан»

1. `first-player main 200` после каждой итерации правил
2. Если `Advantage > 3 pp` — сломали, надо компенсацию

### 14.6. «Бот упал на каком-то seed — что делать?»

1. `trace main <deck1> <deck2> <seed> <botName> > trace.log`
2. Смотрим в конце — `no command (bot returned null)` или `✗REJECTED`
3. Если rejected — баг в боте (невалидная команда)
4. Если null — баг в логике (bot не нашёл команду)

### 14.7. «Хочу проверить, работает ли замена»

1. `replacement-analysis main 100` — utilization
2. Если < 10% — механика мёртвая
3. Если 10-30% — работает, но ситуативно
4. Если `Wins by replacer < 45%` — бот делает замену неправильно. Trace

### 14.8. «Хочу посмотреть детали конкретной карты»

```bash
# Если не знаешь id — по имени
pnpm run --filter @aspects/simtools card-stats main 100 --card "Ростовчанин"

# Если знаешь id
pnpm run --filter @aspects/simtools card-stats main 100 --card classic_hacker
```

**Если карта не набрала сэмплов:**

```
⚠ Ростовчанин (classic_hacker): недостаточно сэмплов.
  drawn: 15, played: 8
  minSamples=20. Попробуй --min-samples 8
```

Снижай порог и смотри снова:

```bash
pnpm run --filter @aspects/simtools card-stats main 100 --card classic_hacker --min-samples 5
```

**Если карта вообще ни разу не попала в руку** — значит её нет в пресетах scope. Проверь через `list main <deck>`.

### 14.9. «Нужен полный список всех карт»

```bash
pnpm run --filter @aspects/simtools card-stats main 100 --all > card-stats-all.txt
```

Открой `card-stats-all.txt` — там все карты, которые были в руке хотя бы раз. С `--min-samples 5` — почти все карты scope.

**Сортировка:**
- `--sort delta` — сначала самые «ценные» (Δ высокий)
- `--sort playRate` — сначала «мёртвые» (playRate низкий)
- `--sort played` — сначала самые играемые
- `--sort cost` — по стоимости
- `--sort medianTurn` — по медианному ходу

---

## 15. Troubleshooting

### 15.1. `Unknown deck`

**Проблема:** `deckId` не найден в scope.

**Решение:**
- `list <scope>` — список валидных deckId
- Проверь, что пресет использует только карты серий из scope

### 15.2. `Unknown bot`

**Проблема:** `botName` не в списке.

**Решение:**
- `list` — все 36 ботов
- Формат: `heuristic-v5-<profile>-<level>`

### 15.3. `Empty scope`

**Проблема:** `resolveScope(<arg>)` вернул пустой массив.

**Решение:**
- Проверь имя: `main`, `ashenlight`, `oskol`
- Для явного списка — через запятую без пробелов: `classic,throne`

### 15.4. `Each deck must have exactly 30 cards`

**Проблема:** в `runOneGameRaw` передали `string` вместо `string[]`.

**Решение:**
- Для `deck-optimizer`, `keyword-stats`, `combat-efficiency` — передавай `deck.cards` (массив card ids), не `deck.id`

### 15.5. `hitLimitCount > 0`

**Проблема:** партия прервана по `maxSteps` или rejected-команде.

**Решение:**
- Trace проблемного seed
- Если rejected — баг бота
- Если timeout — партия не сходится

### 15.6. `Could not generate N valid decks`

**Проблема:** `deck-optimizer` не смог набрать популяцию.

**Решение:**
- Уменьши `--pop`
- Проверь, что в scope достаточно карт (нужно > 30 уникальных)

### 15.7. `pnpm --filter X list` — работает не так

**Проблема:** встроенный `list` перехватывает команду.

**Решение:** всегда `pnpm run --filter X <script>` (с `run`).

### 15.8. `Cannot find module @aspects/simtools`

**Проблема:** пакет не собран или не установлен.

**Решение:**
```bash
pnpm install
pnpm --filter @aspects/simtools build
```

### 15.9. `replacement-analysis` показывает 0%

**Было актуально до v0.3.** Пофикшено — теперь ищет `CARD_REPLACED` в событиях любой команды.

Если всё ещё 0% — проверь:
- `grep CARD_REPLACED packages/engine/src/commands/replace.ts` — событие эмитится?
- Есть ли в пресетах карты с одной Личностью (нужны для замены)?

### 15.10. `Unknown pack` при обращении к `getPack`

**Проблема:** пытаешься использовать `getPack('ashenlight')` — но `ashenlight` это **scope**, не серия.

**Решение:** использовать `cardsForScope('ashenlight')` вместо `getPack('ashenlight')`.

### 15.11. Боты играют по-разному на одинаковом seed

**Проблема:** бот stateful, используется один инстанс.

**Решение:** всегда `botFactories: { p1: () => makeBot(name), p2: () => makeBot(name) }`.

### 15.12. `shield_blocked = 0%` в `attack-efficiency`

**Было актуально до v0.3.1.** Пофикшено — теперь щит-блоки считаются через `SHIELD_ABSORBED` событие.

Если всё ещё 0%:
- **Проверь, есть ли щиты в пресетах:** `deck-diff main strazha divan` → раздел `Keywords`. Если `shield` нет ни в одной колоде — 0% правда.
- **Проверь, обходит ли бот щиты:** `scoreAttackHeur` имеет `if (preview.shieldBlocks && !preview.defenderDies) score -= 250` — бот **избегает** атак в щит. Поэтому 0% может быть **правильным** поведением.

### 15.13. `card-stats --card <id>` — «недостаточно сэмплов»

**Проблема:** карта была в руке, но реже `minSamples` (default 20) раз.

**Решение:** снизь порог:

```bash
pnpm run --filter @aspects/simtools card-stats main 100 --card <id> --min-samples 5
```

Если и с 5 не находит — значит карта **редко попадает в руку**. Может быть, её нет в пресетах, или в колоде мало копий.

---

## Финальные заметки

### Что учесть при добавлении нового инструмента

1. **Импорты.** Из `@aspects/engine`, `@aspects/cards`, `@aspects/bot` — напрямую. Из `simtools` — только `runner` и `types`.
2. **Не дёргай `createGame` напрямую.** Используй `runOneGame` / `runOneGameRaw` / `runSeries`. Это даёт детерминизм и `onAfterCommand`.
3. **CLI.** Первый аргумент — scope. Далее — параметры. Валидация `deckId`/`botName` — обязательно.
4. **Вывод.** Числовые таблицы — с `pad()`. Агрегаты — с интерпретацией (что означает число).
5. **Производительность.** 240мс на партию × N. Для 500 партий — 2 минуты.

### Что учесть при интерпретации

1. **Корреляция ≠ причинность.** Особенно в `card-stats` и `keyword-stats`.
2. **Всегда смотри `n`.** Δ +50pp на `n=20` — шум.
3. **Сравнивай с базовыми метриками.** Winrate 60% — хорошо или плохо? Зависит от среднего (обычно 50% в mirror).
4. **Помни про ограничения.** Все инструменты — про **текущий** бот. Если поменяется `HeuristicBot`, сдвинутся все метрики.

### Где обновлять этот документ

При добавлении нового скрипта:
1. Добавь раздел в соответствующую группу
2. Обнови оглавление и таблицу «Список инструментов»
3. Если меняется `runner` API — обнови раздел 4
4. Если меняются baseline метрики — обнови раздел 1
5. **При изменении флагов инструмента** — обнови соответствующий раздел и добавь примеры в раздел 14

---

**Конец документа.** Обновлено под baseline v0.3.1 (glory 25, Despair off, мгновенная alt-victory, underdog-draw off, замена со скидкой, бот v6.1, pace 24.3).

Если что-то устарело — править при первом столкновении. Если появился новый инструмент — добавить раздел. Если изменилось правило — отметить в «Baseline».