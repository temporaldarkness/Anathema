# Техническое руководство по созданию карт — «Аспекты Штормграда» (v0.4)

> **Статус:** Обновлено после Reality Check.
> **Назначение:** Исчерпывающий справочник для Баланс-сессии и дизайнеров. Позволяет создавать валидные, сбалансированные карты без обращения к другим документам.

---

## 1. Об игре

**«Аспекты»** — ККИ 1v1 на пятиколоночном поле. Каждый игрок управляет гильдией, выкладывает карты Аспектов и сражается за контроль над нейтральными клетками.

**Ключевые понятия:**
- **Личность** (`personalityTag`) — персонаж (Юко, Темпорал, Аска). У одной Личности может быть несколько Аспектов — карт с разными ролями. На поле может быть **только один Аспект Личности одновременно**.
- **Замена** — ключевая механика: стоящий Аспект можно заменить на другой Аспект той же Личности из руки (со скидкой).
- **Фракция** — тег принадлежности (stormwind, burgundy, enterprise, ganimed).
- **Серия** — тематический пак (например, `classic`, `throne`, `cathedral`).
- **Роль** — тематический тег (fighter, ruler, scholar, bot, creator).
- **Величие** — 25 стартовых. 0 = поражение.
- **Влияние** — мана. +1 в начале хода, максимум 10.
- **Клетки** — 5 нейтралов по колонкам. Дают бонусы. 5/5 = мгновенная победа.

**Правила колоды:**
- Ровно **30 карт**.
- Максимум **5 копий** одной Личности (среди всех её аспектов).
- Максимум **2 копии** одной карты (одного аспекта).
- Максимум **1 легендарки** в колоде.
- Максимум **4 серии** в колоде.
- Одна карта с `starter` даёт гарантию попадания в стартовую руку.

---

## 2. Модель данных карты

```json
{
  "id": "series_personality_role",
  "name": "Название карты",
  "personalityTag": "personality_id",
  "tags": ["faction", "role", "custom_tag"],
  "cost": 3,
  "strength": 3,
  "health": 4,
  "rarity": "common | uncommon | rare | epic | legendary",
  "abilities": ["charge", "taunt"],
  "triggers": [],
  "activatedAbilities": [],
  "series": ["series_id"],
  "factions": ["stormwind"],
  "roles": ["fighter"],
  "title": "Короткий эпиграф",
  "shortDescription": "Одно предложение до 80 знаков.",
  "lore": "3–5 предложения лора в одну строку.",
  "abilityInfo": {
    "charge": {"name": "Рвение", "description": "Сразу выходит во Фронт."}
  }
}
```

**Опциональные поля:**
- `cleaveDamage: number` — для `cleave`, по умолчанию 1.
- `tempDuration: number` — для `temporary`, длительность в ходах.
- `isToken: true` — для токенов.
- `entersExhausted: true` — карта входит истощённой.
- `cantBeReplaced: true` — нельзя заменить другой картой той же Личности.

---

## 3. Ключевые слова (`abilities`)

| Keyword | Имя | Эффект |
|---|---|---|
| `charge` | Рвение | Выходит сразу во Фронт при розыгрыше |
| `slow` | Замедление | Пропускает первый плановый выход во Фронт |
| `vanguard` | Авангард | Выходит во Фронт, если контролируешь нейтрал в колонке |
| `taunt` | Страж | Противник обязан атаковать эту карту (если может) |
| `scout` | Разведка | Может атаковать Резерв, игнорирует Страж |
| `breakthrough` | Прорыв | Избыток урона идёт в Резерв за целью |
| `shield` | Щит | Поглощает первый входящий урон целиком |
| `suppress` | Подавление | −1/−1 карте напротив |
| `temporary` | Временная | Исчезает через `tempDuration` ходов |
| `armored` | Броня | Весь входящий урон −1 (складывается с колонкой 4) |
| `regenerate` | Регенерация | +1 HP в конце своего хода |
| `cleave` | Рассечение | Атака задевает соседей цели на `cleaveDamage` |
| `frenzy` | Ярость | Может атаковать дважды за ход |
| `starter` | Стартер | Одна копия гарантированно в стартовой руке |

---

## 4. Триггеры (`triggers[]`)

### Полный список поддерживаемых триггеров движком:

| Триггер | Когда срабатывает |
|---|---|
| `ON_ENTER` | При розыгрыше из руки (не при замене) |
| `ON_EXIT` | При уходе в сброс (не при замене) |
| `ON_REINFORCE` | При переходе Резерв → Фронт |
| `ON_REPLACE` | Когда эта карта заменяет другую той же Личности |
| `ON_TURN_START` | В начале хода владельца |
| `ON_TURN_END` | В конце хода владельца |
| `ON_THIS_DAMAGED` | Когда эта карта получает урон |
| `ON_ALLY_ATTACKED` | Союзник атакован |
| `ON_ENEMY_ATTACK` | Враг атакует |
| `ON_ALLY_DIED` | Союзник погиб |
| `ON_ATTACK` | **До** расчёта урона этой карты |
| `ON_KILL` | Когда эта карта **убивает** другую |
| `ON_DAMAGE_DEALT` | Когда эта карта наносит урон |
| `ON_CELL_CAPTURED` | Владелец **захватывает** нейтрал |
| `ON_CELL_LOST` | Владелец **теряет** нейтрал |
| `ON_CARD_DRAWN` | Владелец берёт карту |

---

## 5. Эффекты (`effects[]`)

### Полный список поддерживаемых эффектов:

**Урон / лечение:**
```json
{"kind": "DEAL_DAMAGE", "amount": 3, "target": "ALL_ENEMY_FRONT", "filter": {...}}
{"kind": "HEAL", "amount": 2, "target": "CHOSEN"}
{"kind": "DAMAGE_GLORY", "amount": 2, "who": "OPPONENT"}
{"kind": "HEAL_GLORY", "amount": 5, "who": "SELF"}
```

**Статы:**
```json
{"kind": "BUFF", "strength": 1, "health": 1, "target": "ALL_FRIENDLY_FRONT", "filter": {...}}
```

**Ресурсы:**
```json
{"kind": "GAIN_INFLUENCE", "amount": 2, "who": "SELF"}
{"kind": "SPEND_INFLUENCE", "amount": 2, "who": "OPPONENT"}
```

**Карты:**
```json
{"kind": "DRAW", "count": 2, "who": "SELF"}
{"kind": "DISCARD_RANDOM", "count": 1, "who": "OPPONENT"}
{"kind": "DISCARD_CHOSEN", "count": 1, "who": "OPPONENT"}
{"kind": "RETURN_TO_HAND", "target": "CHOSEN"}
{"kind": "RETURN_FROM_DISCARD", "count": 1, "who": "SELF", "destination": "HAND"}
```

**Позиция:**
```json
{"kind": "EXHAUST_TARGET", "target": "OPPOSITE"}
{"kind": "UNEXHAUST_TARGET", "target": "ALL_FRIENDLY_FRONT"}
{"kind": "MOVE_CARD", "target": "SELF", "to": "RANDOM_OWN_EMPTY"}
{"kind": "MOVE_TO_COLUMN", "target": "SELF", "column": 3}
```

**Обезвреживание:**
```json
{"kind": "SILENCE_TARGET", "target": "CHOSEN"}
```

**Призыв:**
```json
{"kind": "SUMMON", "defId": "tk_skeleton", "count": 2, "who": "SELF", "destination": "FRONT"}
```

**Специальные:**
```json
{
  "kind": "CHOOSE_TARGETS_THEN",
  "selection": {"from": "ENEMY_BOARD", "count": 1},
  "then": [ {"kind": "DEAL_DAMAGE", "amount": 4, "target": "CHOSEN"} ]
}
```

---

## 6. Селекторы и фильтры

### Селекторы (`target`)
`SELF`, `OWNER_HERO`, `ENEMY_HERO`, `CHOSEN`, `ATTACKER`, `OPPOSITE`,
`ALL_FRIENDLY_FRONT`, `ALL_ENEMY_FRONT`, `ALL_FRIENDLY_BOARD`, `ALL_ENEMY_BOARD`, `ALL_CARDS_ON_BOARD`,
`RANDOM_FRIENDLY_FRONT`, `RANDOM_ENEMY_FRONT`.

### Фильтр
Добавляется к **списковым** селекторам (`ALL_*`, `RANDOM_*`).
Поля: `tag`, `keyword`, `minStrength`, `maxStrength`, `minCost`, `maxCost`, `withoutShield: true`.

---

## 7. Условия (`condition`)

| Kind | Значение |
|---|---|
| `CELLS` | Кол-во нейтралов |
| `FRONT_COUNT` | Кол-во карт во Фронте |
| `GLORY` | Величие |
| `INFLUENCE` | Влияние |
| `HAND_COUNT` | Размер руки |
| `SELF_HEALTH` / `SELF_STRENGTH` | Свой стат |
| `TOTAL_STRENGTH` / `TOTAL_HEALTH` | Сумма по Фронту |
| `TURN_NUMBER` | Номер хода |
| `IN_RESERVE` / `IN_FRONT` | Зона карты |
| `IS_FIRST_PLAYER` | Играет ли первым |

Композиция: `AND`, `OR`, `NOT`. Рекурсивно, любой глубины.

---

## 8. Активируемые способности

```json
"activatedAbilities": [
  {
    "id": "ability_id",
    "name": "Название",
    "description": "Что делает.",
    "cost": 2,
    "discardCost": 1,
    "effects": [ {...} ]
  }
]
```

- `cost` — Влияние.
- `discardCost` — доп. цена: сбросить N карт из руки (игрок выбирает).
- Можно использовать раз в ход, даже истощённой картой во Фронте.

---

## 9. Текущее состояние меты (Данные аудита от 30.10.2026)

> **Внимание Баланс-сессии:** В основной игре уже **116 карт** и **35 личностей**. Мета начала формироваться. Не создавай «ещё одного ванильного юнита за 2 маны» без необходимости.

### 9.1. Кривая маны (Перекос в Midrange!)
- **Cost 1: 7 карт** — Критически мало для Aggro!
- Cost 2-4: 89 карт — Большое ядро для Midrange.
- Cost 5+: 17 карт — Небольшой объём финишеров.

**Задача:** Инъекция 10-15 агрессивных карт стоимости 1 с механиками `charge`, `frenzy`, `scout`.

### 9.2. Редкости
- common: 16 | uncommon: 32 | rare: 38 | epic: 17 | legendary: 10 (~9%).

### 9.3. Топ-личности (Готовые архетипы)
- `temporal` (8 аспектов), `yuoko` (8), `alt` (7).
- `gorox`, `spy`, `inki`, `hyper`, `hacker`, `safno`, `zamiatish` (по 5 аспектов).

**Задача:** Создавать новые аспекты для личностей с 1-2 картами, чтобы выровнять пул.

### 9.4. Инструменты для дизайнера

Перед созданием новой карты **обязательно** проверь, не изобретаешь ли ты велосипед:

```bash
# Найти механические дубли в scope main
pnpm run --filter @aspects/simtools card-overlap main

# С расширенным порогом (игнорировать статы, сравнивать только механики)
pnpm run --filter @aspects/simtools card-overlap main --max-diff 2 --ignore-stats
```

Если `card-overlap` показывает, что твоя новая карта механически идентична существующей — **не создавай её**. Лучше усиль существующую или создай вариант с другим тегом Личности.

После создания карты проверь её эффективность:

```bash
# Детали конкретной карты
pnpm run --filter @aspects/simtools card-stats main 100 --card <new_card_id>

# Полный список всех карт (для ревизии)
pnpm run --filter @aspects/simtools card-stats main 100 --all --sort playRate
```

**Целевые метрики для новой карты:**
- `playRate > 15%` — карта играется, не «мёртвый груз»
- `Δ > +3pp` — карта реально помогает выигрывать
- `medianTurn` соответствует ожидаемой роли (1-3 для Aggro, 8+ для Control)

---

## 10. Правила дизайна

### 10.1. Кривая статов

| cost | Обычные статы | Примечание |
|---|---|---|
| 1 | 1/2, 2/1 | 2/1 = рискованно; 1/1 charge — безопасно |
| 2 | 2/3, 3/2, 1/4 taunt | 2/3 — эталон |
| 3 | 3/3, 3/4, 4/2 | 3/4 — эталон |
| 4 | 4/4, 3/5, 4/3 charge | 4/5 — верхняя граница |
| 5 | 4/5, 5/5 | 5/5 — эталон |
| 6 | 5/6, 4/7, 6/6 | 6/6 — крупная угроза |
| 7+ | 6/7, 7/8 | только легендарки, обычно со `slow` |

**Правило:** карта с эффектом теряет 0.5–1 стат по сравнению с ванильной.

### 10.2. Бюджет эффектов
- 1 dmg ETB ≈ −0.5 HP
- 2 dmg ETB ≈ −1 HP
- +1/+1 всем ETB ≈ −1 HP
- charge ≈ −1 HP
- taunt ≈ +0.5 HP (бонус)
- scout / breakthrough ≈ −0.5 HP
- Draw 1 ETB — отлично для 1-3 cost. Для 4+ cost добор бесполезен.

### 10.3. Запрещённые комбинации
1. **`charge` + ETB damage** на cost ≤3.
2. **AoE 3+ dmg** на cost ≤4.
3. **Любая 1-cost с 2+ keywords** (кроме 1/1 charge + scout).
4. **Два сильных ETB-эффекта на одной карте** (кроме легендарок).
5. **Запрещено:** charge + scout + statline 2/2 или выше на cost ≤ 3.
6. **Пейоффы за клетки** должны быть ТОЛЬКО на `ON_CELL_CAPTURED`. Триггеры `ON_CELL_LOST` — запрещены (коррелируют с поражением).
7. **Не создавай механические дубли.** Перед созданием карты прогони `card-overlap main`. Если расстояние до существующей карты ≤ 1 — это дубль, не создавай.

### 10.4. Сложность
- **50% Simple** — статы + 0–1 ключевое слово.
- **30% Standard** — статы + 1 эффект.
- **15% Complex** — 2 эффекта или условный триггер.
- **5% Unique** — легендарки.

---

## 11. Чего не делать

**Не использовать** (движок не поддерживает):
- Deathtouch, lifesteal, stealth, ambush, flank, support.
- Mill, tutor, peek, reorder.
- Трансформация, копирование, кража.
- `aura` — постоянные пассивные эффекты.
- `REVIVE` — только `RETURN_FROM_DISCARD` в руку.
- `ON_GLORY_DAMAGED`, `ON_LOW_GLORY`.

**Не создавать новых keywords / триггеров / эффектов.** Только из списка выше.

---

## 12. Чек-лист перед отправкой

- [ ] Все `id` уникальны, формат `series_name`.
- [ ] Статы соответствуют кривой.
- [ ] Нет запрещённых комбинаций.
- [ ] Легендарок ≤ 10% карт.
- [ ] Есть 1–2 карты на cost 1 (для баланса кривой).
- [ ] `abilityInfo` заполнен для всех keywords.
- [ ] `shortDescription` ≤ 60 знаков.
- [ ] `lore` — 2–4 предложения, одна строка.
- [ ] `title` не пустой даже у токенов.
- [ ] Карта заполняет дыру в мете (Aggro/Control/Alt-Victory)?
- [ ] JSON прошёл `pnpm --filter @aspects/cards validate`.

---

## 13. Примеры карт

### 13.1. `filter` + tribal (Rare)
```json
{
  "id": "throne_blade_master",
  "name": "Мастер клинка",
  "personalityTag": "blade_master",
  "tags": ["stormwind", "fighter"],
  "cost": 4, "strength": 3, "health": 4,
  "rarity": "rare",
  "abilities": [],
  "series": ["throne"],
  "factions": ["stormwind"],
  "roles": ["fighter"],
  "title": "Клинки вместе",
  "shortDescription": "Все fighter'ы во Фронте получают +1/+1.",
  "lore": "Один клинок — не сила. Сила — в клинках, что стоят рядом.",
  "triggers": [
    {
      "id": "sword_brothers",
      "trigger": "ON_ENTER",
      "name": "Клинки вместе",
      "effects": [
        {
          "kind": "BUFF", "strength": 1, "health": 1,
          "target": "ALL_FRIENDLY_FRONT",
          "filter": { "tag": "fighter" }
        }
      ]
    }
  ],
  "abilityInfo": {}
}
```

### 13.2. `frenzy` + `ON_KILL` (Rare)
```json
{
  "id": "inner_duelist",
  "name": "Дуэлянт",
  "personalityTag": "duelist_honor",
  "tags": ["burgundy", "fighter"],
  "cost": 4, "strength": 3, "health": 3,
  "rarity": "rare",
  "abilities": ["frenzy"],
  "series": ["inner"],
  "factions": ["burgundy"],
  "roles": ["fighter"],
  "title": "Каждая победа — рост",
  "shortDescription": "Убивает — становится сильнее.",
  "lore": "Дуэлянт чести не ищет врагов. Но если враг найден — он не останется прежним.",
  "triggers": [
    {
      "id": "each_kill",
      "trigger": "ON_KILL",
      "name": "Мастерство",
      "effects": [
        {"kind": "BUFF", "strength": 1, "health": 1, "target": "SELF"}
      ]
    }
  ],
  "abilityInfo": {
    "frenzy": {"name": "Ярость", "description": "Может атаковать дважды за ход."}
  }
}
```

### 13.3. `discardCost` — ритуал (Rare)
```json
{
  "id": "inner_blood_pact",
  "name": "Кровавый Ритуал",
  "personalityTag": "blood_pact",
  "tags": ["burgundy", "scholar"],
  "cost": 3, "strength": 3, "health": 3,
  "rarity": "rare",
  "abilities": [],
  "series": ["inner"],
  "factions": ["burgundy"],
  "roles": ["scholar"],
  "title": "Плата картой",
  "shortDescription": "Сбрось карту — нанеси 6 урона.",
  "lore": "Кровь за кровь. Знание за знание.",
  "activatedAbilities": [
    {
      "id": "blood_pact",
      "name": "Кровавый Ритуал",
      "description": "Сбрось 1 карту — нанеси 6 урона выбранной цели.",
      "cost": 2,
      "discardCost": 1,
      "effects": [
        {
          "kind": "CHOOSE_TARGETS_THEN",
          "selection": {"from": "ANY_CARD", "count": 1},
          "then": [{"kind": "DEAL_DAMAGE", "amount": 6, "target": "CHOSEN"}]
        }
      ]
    }
  ],
  "abilityInfo": {}
}
```

### 13.4. `ON_CELL_CAPTURED` — пейофф для Alt-Victory (Uncommon)
```json
{
  "id": "inner_standard_bearer",
  "name": "Стандартоносец",
  "personalityTag": "standard_bearer",
  "tags": ["stormwind", "fighter"],
  "cost": 2, "strength": 2, "health": 2,
  "rarity": "uncommon",
  "abilities": ["starter"],
  "series": ["inner"],
  "factions": ["stormwind"],
  "roles": ["fighter"],
  "title": "Всегда готов",
  "shortDescription": "Растёт от каждого захвата клетки.",
  "lore": "Пока знамя стоит — никто не сдастся.",
  "triggers": [
    {
      "id": "capture_growth",
      "trigger": "ON_CELL_CAPTURED",
      "name": "Знамя растёт",
      "effects": [{"kind": "BUFF", "strength": 1, "health": 1, "target": "SELF"}]
    }
  ],
  "abilityInfo": {
    "starter": {"name": "Стартер", "description": "Одна копия гарантированно в стартовой руке."}
  }
}
```

---

## 14. Заключительные заметки

**Главная идея игры — Aspect-Shift.** Каждая Личность может иметь несколько аспектов с разными ролями. Игрок меняет аспекты по ситуации. Поддерживайте это: если у вас есть Личность с 3+ аспектами — сделайте ещё один аспект, который кардинально меняет её роль.

**Не бойтесь простых карт.** 2/2 без эффектов — это **хорошо**. Кривая должна быть плотной, не каждый слот — «интересная карта».

**Учитывайте мету.** Если вы делаете пак — думайте, какие **архетипы** он поддерживает. Aggro, Midrange, Control, Tribal, Alt-Victory. Пак на 20 карт должен закрывать **2–3 архетипа**.

**Проверяйте запрещённое.** Правила — не рекомендации, а жёсткие ограничения. Такие карты ломают игру.
```