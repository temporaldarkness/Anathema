VOICES = {
    "dmitri":  {"model": "ru_RU-dmitri-medium", "gender": "male",   "style": "calm",   "label": "Дмитрий (спокойный)"},
    "ruslan":  {"model": "ru_RU-ruslan-medium", "gender": "male",   "style": "warm",   "label": "Руслан (тёплый)"},
    "irina":   {"model": "ru_RU-irina-medium",  "gender": "female", "style": "bright", "label": "Ирина (живая)"},
    "denis":   {"model": "ru_RU-denis-medium",  "gender": "male",   "style": "neutral","label": "Денис (нейтральный)"},
}

DEFAULT_VOICE = "dmitri"


def get_voice(voice_id: str) -> dict | None:
    return VOICES.get(voice_id)


def list_voices() -> list[dict]:
    return [{"id": k, **v} for k, v in VOICES.items()]