import re
from transliterate import translit
PRONUNCIATION_OVERRIDES = {
    "dungeon":   "данжэн",
    "master":    "мастер",
    "master's":  "мастерс",
    "dice":      "дайс",
    "sword":     "сорд",
    "night":     "найт",
    "light":     "лайт",
    "dream":     "дрим",
    "heart":     "харт",
    "storm":     "шторм",
    "wind":      "винд",
    "fire":      "файер",
    "king":      "кинг",
    "queen":     "куин",
    "lord":      "лорд",
    "lady":      "леди",
    "dark":      "дарк",
    "soul":      "соул",
    "love":      "лав",
    "life":      "лайф",
    "dance":     "данс",
    "sound":     "саунд",
    "voice":     "войс",
    "dnd":       "ди-эн-ди",
    "ost":       "оу-эс-ти",
    "mix":       "микс",
    "original":  "ориджинал",
    "official":  "офиишл",
    "remaster":  "ремастер",
    "remastered":"ремастерд",
    "version":   "версия",
    "radio":     "радио",
    "edit":      "эдит",
    "hacker":    "хакер",
    "easy":      "изи"
}

LATIN_WORD_RE = re.compile(r"[A-Za-z][A-Za-z'’\-]*[A-Za-z]|[A-Za-z]")


def _normalize_latin_word(word: str) -> str:
    clean = word.replace("’", "").replace("'", "").replace("-", " ")
    lower = clean.lower().strip()
    if lower in PRONUNCIATION_OVERRIDES:
        return PRONUNCIATION_OVERRIDES[lower]
    try:
        return translit(clean, 'ru')
    except Exception:
        return clean


def normalize_for_tts(text: str) -> str:
    if not text:
        return ""

    def repl(match):
        return _normalize_latin_word(match.group(0))

    text = LATIN_WORD_RE.sub(repl, text)

    text = text.replace('"', '').replace("«", "").replace("»", "")
    text = text.replace("&", " и ")
    text = text.replace("@", " собака ")
    text = text.replace("#", " номер ")
    text = text.replace("*", "")
    text = text.replace("/", " или ")
    text = text.replace("+", " плюс ")

    text = re.sub(r"\s+", " ", text).strip()
    return text

def clean_only(text: str) -> str:
    if not text:
        return ""
    text = text.replace('"', '').replace("«", "").replace("»", "")
    text = text.replace("&", " и ")
    text = text.replace("@", " собака ")
    text = text.replace("#", " номер ")
    text = text.replace("*", "")
    text = text.replace("/", " или ")
    text = text.replace("+", " плюс ")
    import re
    text = re.sub(r"\s+", " ", text).strip()
    return text