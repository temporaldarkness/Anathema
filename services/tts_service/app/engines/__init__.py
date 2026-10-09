import logging
from .base import TTSEngine
from .piper import PiperEngine
from .silero import SileroEngine
# from .yandex import YandexEngines

logger = logging.getLogger(__name__)

_ENGINES: dict[str, TTSEngine] = {
    "piper":  PiperEngine(),
    "silero": SileroEngine(),
    # "yandex": YandexEngine(),
}


def get_engine(name: str) -> TTSEngine:
    engine = _ENGINES.get(name)
    if not engine:
        raise ValueError(f"Unknown engine: {name}")
    return engine


async def synthesize(text: str, voice_id: str) -> bytes:
    from ..voices import get_voice
    voice = get_voice(voice_id)
    if not voice:
        raise ValueError(f"Unknown voice: {voice_id}")
    engine = get_engine(voice["engine"])
    return await engine.synthesize(text, voice_id)