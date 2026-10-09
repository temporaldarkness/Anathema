VOICES = {
    # Piper
    "dmitri":  {"engine": "piper",  "model": "ru_RU-dmitri-medium", "gender": "male",   "style": "calm",   "label": "Дмитрий (спокойный)"},
    "ruslan":  {"engine": "piper",  "model": "ru_RU-ruslan-medium", "gender": "male",   "style": "warm",   "label": "Руслан (тёплый)"},
    "irina":   {"engine": "piper",  "model": "ru_RU-irina-medium",  "gender": "female", "style": "bright", "label": "Ирина (живая)"},
    "denis":   {"engine": "piper",  "model": "ru_RU-denis-medium",  "gender": "male",   "style": "neutral","label": "Денис (нейтральный)"},

    # Silero
    "aidar":   {"engine": "silero", "gender": "male",   "style": "news",    "label": "Айдар (дикторский)"},
    "baya":    {"engine": "silero", "gender": "female", "style": "calm",    "label": "Бая (спокойная)"},
    "kseniya": {"engine": "silero", "gender": "female", "style": "bright",  "label": "Ксения (живая)"},
    "xenia":   {"engine": "silero", "gender": "female", "style": "warm",    "label": "Ксения (тёплая)"},
    "eugene":  {"engine": "silero", "gender": "male",   "style": "neutral", "label": "Евгений (нейтральный)"},
}


def get_voice(voice_id: str) -> dict | None:
    return VOICES.get(voice_id)


def list_voices() -> list[dict]:
    return [{"id": k, **v} for k, v in VOICES.items()]