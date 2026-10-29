# Технический контекст «Аспекты» — полное руководство для создания карт

*Документ самодостаточен. Дайте его дизайнеру или сессии — и они смогут создавать карты без дополнительных пояснений.*

---

## 1. О игре

**«Аспекты»** — ККИ 1v1 на пятиколоночном поле. Каждый игрок управляет гильдией, выкладывает карты Аспектов и сражается за контроль над нейтральными клетками.

**Ключевые понятия:**

- **Личность** (`personalityTag`) — персонаж (Юко, Темпорал, Аска). У одной Личности может быть несколько Аспектов — карт с разными ролями. На поле может быть **только один Аспект Личности одновременно**.
- **Замена** — ключевая механика: стоящий Аспект можно заменить на другой Аспект той же Личности из руки.
- **Фракция** — тег принадлежности (stormwind, burgundy, enterprise, ganimed). Используется для билдинга.
- **Серия** — тематический пак (classic, cradle, throne, inner, integration, cathedral).
- **Роль** — тематический тег (fighter, ruler, scholar, bot, creator).
- **Величие** — HP гильдии. 25 стартовых. 0 = поражение.
- **Влияние** — мана. +1 в начале хода, максимум 10.
- **Клетки** — 5 нейтралов по колонкам. Дают бонусы. 5/5 = альтернативная победа.

**Правила колоды:**
- Ровно **30 карт**.
- Максимум **5 копий** одной Личности (среди всех её аспектов).
- Максимум **2 копии** одной карты (одного аспекта).
- Максимум **1 легендарки** в колоде.
- Одна карта с `starter` даёт стартовую руку — гарантированно.

---

## 2. Модель данных карты

```json
{
  "id": "series_personality_role",
  "name": "Роль",
  "personalityTag": "personality_id",
  "tags": ["faction", "role"],
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
    "charge": {"name": "Рвение", "description": "..."}
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

### Базовые

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

### Новые

| Keyword | Имя | Эффект |
|---|---|---|
| `armored` | Броня | Весь входящий урон −1 (складывается с колонкой 4) |
| `regenerate` | Регенерация | +1 HP в конце своего хода |
| `cleave` | Рассечение | Атака задевает соседей цели по колонкам на `cleaveDamage` (по умолч. 1) |
| `frenzy` | Ярость | Может атаковать дважды за ход |
| `starter` | Стартер | Одна копия гарантированно в стартовой руке |

---

## 4. Триггеры (`triggers[]`)

Все триггеры имеют структуру:

```json
{
  "id": "unique_id",
  "trigger": "ON_ENTER",
  "oncePerTurn": true,
  "condition": { "kind": "...", "op": "...", "value": 0 },
  "effects": [ { "kind": "..." } ]
}
```

### Базовые

| Trigger | Когда |
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

### Combat

| Trigger | Когда |
|---|---|
| `ON_ATTACK` | **До** расчёта урона. Если эффект убил атакующего — атака отменяется |
| `ON_KILL` | Когда эта карта **убивает** другую (включая добивание через breakthrough) |
| `ON_DAMAGE_DEALT` | Когда эта карта наносит урон (только от боя) |

### Событийные

| Trigger | Когда |
|---|---|
| `ON_CELL_CAPTURED` | Когда владелец **захватывает** нейтрал (у всех карт во Фронте) |
| `ON_CELL_LOST` | Когда владелец **теряет** нейтрал (у всех карт во Фронте) |
| `ON_CARD_DRAWN` | Когда владелец берёт карту (включая DRAW и RETURN) |

---

## 5. Эффекты (`effects[]`)

### Урон / лечение

```json
{"kind": "DEAL_DAMAGE", "amount": 3, "target": "ALL_ENEMY_FRONT", "filter": {...}}
{"kind": "HEAL", "amount": 2, "target": "CHOSEN"}
{"kind": "DAMAGE_GLORY", "amount": 2, "who": "OPPONENT"}
{"kind": "HEAL_GLORY", "amount": 5, "who": "SELF"}
```

### Статы

```json
{"kind": "BUFF", "strength": 1, "health": 1, "target": "ALL_FRIENDLY_FRONT", "filter": {...}}
```

### Ресурсы

```json
{"kind": "GAIN_INFLUENCE", "amount": 2, "who": "SELF"}
{"kind": "SPEND_INFLUENCE", "amount": 2, "who": "OPPONENT"}
```

### Карты

```json
{"kind": "DRAW", "count": 2, "who": "SELF"}
{"kind": "DISCARD_RANDOM", "count": 1, "who": "OPPONENT"}
{"kind": "DISCARD_CHOSEN", "count": 1, "who": "OPPONENT"}
{"kind": "RETURN_TO_HAND", "target": "CHOSEN"}
{"kind": "RETURN_FROM_DISCARD", "count": 1, "who": "SELF", "destination": "HAND"}
```

### Позиция

```json
{"kind": "EXHAUST_TARGET", "target": "OPPOSITE"}
{"kind": "UNEXHAUST_TARGET", "target": "ALL_FRIENDLY_FRONT"}
{"kind": "MOVE_CARD", "target": "SELF", "to": "RANDOM_OWN_EMPTY"}
{"kind": "MOVE_TO_COLUMN", "target": "SELF", "column": 3}
```

### Обезвреживание

```json
{"kind": "SILENCE_TARGET", "target": "CHOSEN"}
```
Снимает **все** keywords и triggers. Не убивает.

### Призыв

```json
{"kind": "SUMMON", "defId": "tk_skeleton", "count": 2, "who": "SELF", "destination": "FRONT"}
```
`destination`: `FRONT` | `RESERVE` | `HAND`.

### Специальные

```json
{
  "kind": "CHOOSE_TARGETS_THEN",
  "selection": {"from": "ENEMY_BOARD", "count": 1},
  "then": [ {"kind": "DEAL_DAMAGE", "amount": 4, "target": "CHOSEN"} ]
}
```

---

## 6. Селекторы (`target`) и фильтры

### Селекторы

`SELF`, `OWNER_HERO`, `ENEMY_HERO`, `CHOSEN`, `ATTACKER`, `OPPOSITE`,
`ALL_FRIENDLY_FRONT`, `ALL_ENEMY_FRONT`, `ALL_FRIENDLY_BOARD`, `ALL_ENEMY_BOARD`, `ALL_CARDS_ON_BOARD`,
`RANDOM_FRIENDLY_FRONT`, `RANDOM_ENEMY_FRONT`.

### Фильтр

Добавляется к любому **списковому** селектору (`ALL_*`, `RANDOM_*`) или к условиям `FRONT_COUNT` / `HAND_COUNT` / `TOTAL_*`.

**Поля:**
- `tag` — тег карты (`"fighter"`, `"bot"`, `"ruler"`)
- `keyword` — ключевое слово (`"taunt"`, `"charge"`, `"armored"`)
- `minStrength` / `maxStrength` — по силе
- `minCost` / `maxCost` — по стоимости
- `withoutShield: true` — только без активного щита

**Пример:**
```json
{
  "kind": "BUFF", "strength": 1, "health": 1,
  "target": "ALL_FRIENDLY_FRONT",
  "filter": { "tag": "fighter" }
}
```

**Не работает** на `SELF`, `CHOSEN`, `ATTACKER`, `*_HERO`.

---

## 7. Условия (`condition`)

### Базовые

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
| `IN_RESERVE` / `IN_FRONT` | Зона карты-источника |
| `IS_FIRST_PLAYER` | Играет ли первым |

Все, кроме `SELF_*`, `IN_*`, `IS_FIRST_PLAYER`, `TURN_NUMBER`, имеют поля `who: "SELF" | "OPPONENT"`, `op: "AT_LEAST" | "AT_MOST" | "EQUAL"`, `value: number`.

### Композитные

```json
{
  "kind": "AND",
  "conditions": [
    {"kind": "GLORY", "who": "SELF", "op": "AT_MOST", "value": 10},
    {"kind": "HAND_COUNT", "who": "SELF", "op": "AT_MOST", "value": 3}
  ]
}
```

Также `OR { conditions }`, `NOT { condition }`. Рекурсивно, любой глубины.

---

## 8. Свойства карты

| Свойство | Что делает |
|---|---|
| `entersExhausted: true` | Карта входит истощённой (не может атаковать в первый ход) |
| `cantBeReplaced: true` | Нельзя заменить другой картой той же Личности |
| `cleaveDamage: N` | Урон от cleave (по умолчанию 1) |
| `tempDuration: N` | Длительность `temporary` |
| `isToken: true` | Токен (не идёт в колоду) |

---

## 9. Активируемые способности

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
- Отмена возможна — ничего не тратится.

---

## 10. Правила дизайна

### Сложность

- **50% Simple** — статы + 0–1 ключевое слово.
- **30% Standard** — статы + 1 эффект.
- **15% Complex** — 2 эффекта или условный триггер.
- **5% Unique** — легендарки.

### Кривая статов

| cost | Обычные статы | Примечание |
|---|---|---|
| 1 | 1/2, 2/1 | 2/1 = рискованно; 1/1 charge — безопасно |
| 2 | 2/3, 3/2, 1/4 taunt | 2/3 — эталон. 1/4 taunt — ЛОВУШКА (не убивает, не окупает). Если делаете стену за 2, делайте её 2/3 taunt или 2/4 shield taunt. 1/4 taunt допустим ТОЛЬКО если у него есть мощный триггер при смерти |
| 3 | 3/3, 3/4, 4/2 | 3/4 — эталон |
| 4 | 4/4, 3/5, 4/3 charge | 4/5 — верхняя граница |
| 5 | 4/5, 5/5 | 5/5 — эталон |
| 6 | 5/6, 4/7, 6/6 | 6/6 — крупная угроза |
| 7+ | 6/7, 7/8 | только легендарки, обычно со `slow` |

**Правило:** карта с эффектом теряет 0.5–1 стат по сравнению с ванильной.

### Бюджет эффектов

- 1 dmg ETB ≈ −0.5 HP.
- 2 dmg ETB ≈ −1 HP.
- +1/+1 всем ETB ≈ −1 HP.
- charge ≈ −1 HP.
- taunt ≈ +0.5 HP (бонус).
- scout / breakthrough ≈ −0.5 HP.
- Draw 1 ETB - отлично для 1-3 cost. Для 4+ cost добор бесполезен (рука переполнена). 4-cost требует точечного ремувала (3 dmg) или массового бафа

### Запрещённые комбинации

1. **`charge` + ETB damage** на cost ≤3.
2. **AoE 3+ dmg** на cost ≤4.
3. **Любая 1-cost с 2+ keywords**.
4. **Два сильных ETB-эффекта на одной карте** (кроме легендарок).
5. Запрещено: charge + scout + statline 2/2 или выше на cost ≤ 3. Можно: 1/1 или 2/1 charge + scout (это стеклянные пушки, они честно размениваются)


- «Пейоффы за клетки (P1) должны быть ТОЛЬКО на ON_CELL_CAPTURED. Триггеры ON_CELL_LOST — запрещены, они коррелируют с поражением

### Редкости

| Редкость | Что содержит |
|---|---|
| Common | Статы + 0–1 простое keyword, без эффектов |
| Uncommon | 1 умеренный эффект (ETB 1 dmg, draw 1, buff 1) |
| Rare | 1 сильный эффект или условный триггер |
| Epic | 2 эффекта, или определяющая карта архетипа |
| Legendary | Уникальная механика, роль в колоде, 1 копия |

### Кривая набора

При создании N карт:
- 1-cost: 15–20%
- 2-cost: 25–30%
- 3-cost: 20–25%
- 4-cost: 15–20%
- 5-cost: 10–15%
- 6+: 5–10%

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
- [ ] Есть 1–2 карты на cost 1.
- [ ] `abilityInfo` заполнен для всех keywords.
- [ ] `shortDescription` ≤ 60 знаков.
- [ ] `lore` — 2–4 предложения, одна строка.
- [ ] JSON валиден.
- [ ] Не изобретено новых механик.

---

## 13. Примеры карт — по одной на каждую новую механику

### 13.1. `filter` + tribal

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

### 13.2. `AND` / композитное условие

```json
{
  "id": "inner_last_stand",
  "name": "Последний рубеж",
  "personalityTag": "last_stand_hero",
  "tags": ["stormwind", "fighter"],
  "cost": 4, "strength": 3, "health": 4,
  "rarity": "epic",
  "abilities": ["taunt"],
  "series": ["inner"],
  "factions": ["stormwind"],
  "roles": ["fighter"],
  "title": "Всё или ничего",
  "shortDescription": "Крепнет, когда дела плохи.",
  "lore": "Когда горит дом — никто не устаёт.",
  "triggers": [
    {
      "id": "desperate_stand",
      "trigger": "ON_TURN_START",
      "oncePerTurn": true,
      "condition": {
        "kind": "AND",
        "conditions": [
          {"kind": "GLORY", "who": "SELF", "op": "AT_MOST", "value": 10},
          {"kind": "FRONT_COUNT", "who": "SELF", "op": "AT_MOST", "value": 2}
        ]
      },
      "name": "Всё или ничего",
      "effects": [
        {"kind": "BUFF", "strength": 2, "health": 2, "target": "SELF"}
      ]
    }
  ],
  "abilityInfo": {
    "taunt": {"name": "Страж", "description": "Противник в этой колонке вынужден атаковать эту карту."}
  }
}
```

### 13.3. `ON_KILL` + `frenzy`

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

Примечание: Frenzy — очень сильная механика. На 3-cost frenzy должна быть не выше 3/2. На 4-cost не выше 3/3. Armored — отлично работает на 3-cost 2/3 или 3/2/3

### 13.4. `SILENCE`

```json
{
  "id": "inner_censor",
  "name": "Цензор",
  "personalityTag": "censor",
  "tags": ["enterprise", "scholar"],
  "cost": 3, "strength": 2, "health": 3,
  "rarity": "rare",
  "abilities": [],
  "series": ["inner"],
  "factions": ["enterprise"],
  "roles": ["scholar"],
  "title": "Слово отнято",
  "shortDescription": "Лишает одну карту всех способностей.",
  "lore": "Цензор не убивает. Он забирает то, что делает тебя опасным.",
  "triggers": [
    {
      "id": "silence",
      "trigger": "ON_ENTER",
      "name": "Изъятие",
      "effects": [
        {
          "kind": "CHOOSE_TARGETS_THEN",
          "selection": {"from": "ENEMY_BOARD", "count": 1},
          "then": [{"kind": "SILENCE_TARGET", "target": "CHOSEN"}]
        }
      ]
    }
  ],
  "abilityInfo": {}
}
```

### 13.5. `armored` + `TOTAL_STRENGTH`

```json
{
  "id": "inner_bunker_defender",
  "name": "Окопник",
  "personalityTag": "bunker_defender",
  "tags": ["stormwind", "fighter"],
  "cost": 3, "strength": 2, "health": 6,
  "rarity": "uncommon",
  "abilities": ["armored", "taunt"],
  "series": ["inner"],
  "factions": ["stormwind"],
  "roles": ["fighter"],
  "title": "В окопе не умирают",
  "shortDescription": "Бронированная стена.",
  "lore": "В окопе ты не умрёшь. В окопе ты не сломаешься.",
  "abilityInfo": {
    "armored": {"name": "Броня", "description": "Весь входящий урон уменьшен на 1."},
    "taunt": {"name": "Страж", "description": "Противник в этой колонке вынужден атаковать эту карту."}
  }
}
```

### 13.6. `ON_CELL_CAPTURED` + `starter`

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

### 13.7. `discardCost` — ритуал

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

### 13.8. `TURN_NUMBER` — late-game

```json
{
  "id": "inner_dormant_titan",
  "name": "Дремлющий Титан",
  "personalityTag": "dormant_titan",
  "tags": ["ganimed", "ruler"],
  "cost": 5, "strength": 3, "health": 3,
  "rarity": "epic",
  "abilities": ["slow"],
  "series": ["inner"],
  "factions": ["ganimed"],
  "roles": ["ruler"],
  "title": "Просыпается поздно",
  "shortDescription": "Слабый в начале, чудовище в late-game.",
  "lore": "Он спал тысячу лет. И просыпается тогда, когда все уже устали.",
  "triggers": [
    {
      "id": "awakening",
      "trigger": "ON_TURN_START",
      "oncePerTurn": true,
      "condition": {"kind": "TURN_NUMBER", "op": "AT_LEAST", "value": 8},
      "name": "Пробуждение",
      "effects": [
        {"kind": "BUFF", "strength": 3, "health": 3, "target": "SELF"}
      ]
    }
  ],
  "abilityInfo": {
    "slow": {"name": "Замедление", "description": "Пропускает первый плановый выход во Фронт."}
  }
}
```

### 13.9. `SPEND_INFLUENCE` — экономическая война

```json
{
  "id": "inner_tax_collector",
  "name": "Сборщик податей",
  "personalityTag": "tax_collector",
  "tags": ["enterprise", "ruler"],
  "cost": 3, "strength": 2, "health": 3,
  "rarity": "rare",
  "abilities": [],
  "series": ["inner"],
  "factions": ["enterprise"],
  "roles": ["ruler"],
  "title": "Ты не отчитался",
  "shortDescription": "Враг теряет 2 Влияния при входе.",
  "lore": "Ты не отчитался за прошлый квартал. Это стоит два Влияния.",
  "triggers": [
    {
      "id": "collect_taxes",
      "trigger": "ON_ENTER",
      "name": "Подать",
      "effects": [
        {"kind": "SPEND_INFLUENCE", "amount": 2, "who": "OPPONENT"}
      ]
    }
  ],
  "abilityInfo": {}
}
```

### 13.10. `cleave`

```json
{
  "id": "inner_cleaver",
  "name": "Рассекатель",
  "personalityTag": "cleaver",
  "tags": ["burgundy", "fighter"],
  "cost": 4, "strength": 3, "health": 3,
  "rarity": "uncommon",
  "abilities": ["cleave"],
  "cleaveDamage": 1,
  "series": ["inner"],
  "factions": ["burgundy"],
  "roles": ["fighter"],
  "title": "Широкий замах",
  "shortDescription": "Атака задевает соседей цели.",
  "lore": "Один клинок — три врага.",
  "abilityInfo": {
    "cleave": {"name": "Рассечение", "description": "Атака задевает соседей цели на 1 урона."}
  }
}
```

---

## 14. Заключительные заметки

**Главная идея игры — Aspect-Shift.** Каждая Личность может иметь несколько аспектов с разными ролями. Игрок меняет аспекты по ситуации. Поддерживайте это: если у вас есть Личность с 3+ аспектами — сделайте ещё один аспект.

**Не бойтесь простых карт.** 2/2 без эффектов — это **хорошо**. Кривая должна быть плотной, не каждый слот — «интересная карта».

**Flavour — на первом месте.** Имя, title, shortDescription, lore — всё должно складываться в **живого персонажа**, а не в «Fighter 3/3». Лор читается легко, шутит, намекает.

**Проверяйте запрещённое.** 6 правил — не рекомендации, а жёсткие ограничения. Такие карты ломают игру.

**Учитывайте метагейм.** Если вы делаете пак — думайте, какие **архетипы** он поддерживает. Aggro, midrange, control, tribal, combo. Пак на 20 карт должен закрывать **2–3 архетипа**, а не «всех по чуть-чуть».

---

*Документ покрывает все механики движка v0.2+. Если креатив-сессия предложит карту с механикой вне этого списка — задача сначала уходит в движок.*