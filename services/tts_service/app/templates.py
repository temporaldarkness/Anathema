import random
from datetime import datetime


# ---------- Анонсы треков ----------
TRACK_TEMPLATES = [
    "А теперь, — {title} от {artist}.",
    "Не переключайтесь. Звучит, {title} — {artist}.",
    "Продолжаем эфир. {title} — {artist}.",
    "Следующая композиция, — {title}, исполняет {artist}.",
    "И вот для вас, {title} от {artist}.",
    "Анафема Радио представляет,: {title} — {artist}.",
    "{title} от {artist}. Оставайтесь с нами.",
    "Под эту вещь, — {title} — {artist}.",
]

# Если у песни есть description — иногда добавляем его
TRACK_WITH_DESC_TEMPLATES = [
    "{title} от {artist}. {description}",
    "Звучит, {title} — {artist}. {description}",
    "Далее,: {title} от {artist}. {description}",
]

# ---------- Приветствия ----------
GREETINGS_MORNING = [
    "Доброе утро. Вы слушаете Анафема Радио.",
    "С утра пораньше — Анафема Радио в эфире.",
    "Утро начинается с Анафема Радио.",
]
GREETINGS_DAY = [
    "Добрый день. В эфире — Анафема Радио.",
    "Анафема Радио. Продолжаем вещание.",
]
GREETINGS_EVENING = [
    "Добрый вечер. Вы слушаете Анафема Радио.",
    "Вечерний эфир Анафема Радио.",
]
GREETINGS_NIGHT = [
    "Доброй ночи. Анафема Радио не спит.",
    "Ночной эфир Анафема Радио. Оставайтесь с нами.",
]

# ---------- Прощания ----------
SIGNOFFS = [
    "На этом всё. Спасибо, что были с нами. Анафема Радио.",
    "Эфир завершён. Хорошего дня. Анафема Радио.",
    "До новых встреч. Это было Анафема Радио.",
    "Мы вернёмся. А пока — всего доброго. Анафема Радио.",
]


def _pick_greeting() -> list[str]:
    h = datetime.now().hour
    if 5 <= h < 12:
        return GREETINGS_MORNING
    if 12 <= h < 18:
        return GREETINGS_DAY
    if 18 <= h < 23:
        return GREETINGS_EVENING
    return GREETINGS_NIGHT


def render_track(title: str, artist: str, description: str | None = None) -> str:
    """Возвращает одну случайно выбранную фразу-анонс."""
    artist = artist.strip() or "неизвестного исполнителя"
    description = (description or "").strip()

    # 30% шанс использовать шаблон с описанием, если оно есть
    if description and random.random() < 0.3:
        tpl = random.choice(TRACK_WITH_DESC_TEMPLATES)
        return tpl.format(title=title, artist=artist, description=description)

    tpl = random.choice(TRACK_TEMPLATES)
    return tpl.format(title=title, artist=artist)


def render_greeting() -> str:
    return random.choice(_pick_greeting())


def render_signoff() -> str:
    return random.choice(SIGNOFFS)