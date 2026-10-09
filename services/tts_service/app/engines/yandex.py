import logging
import httpx

from .base import TTSEngine
from ..config import YANDEX_API_KEY, YANDEX_FOLDER_ID
from ..audio_utils import normalize_wav_to_mp3

logger = logging.getLogger(__name__)

VOICE_MAP = {
    "alena":  "alena",
    "filipp": "filipp",
    "jane":   "jane",
    "zahar":  "zahar",
    "ermil":  "ermil",
}


class YandexEngine(TTSEngine):
    name = "yandex"

    async def synthesize(self, text: str, voice_id: str) -> bytes:
        voice = VOICE_MAP.get(voice_id)
        if not voice:
            raise ValueError(f"Unknown Yandex voice: {voice_id}")

        headers = {
            "Authorization": f"Api-Key {YANDEX_API_KEY}",
            "Content-Type": "application/x-www-form-urlencoded",
        }
        data = {
            "text": text,
            "lang": "ru-RU",
            "voice": voice,
            "format": "mp3",
            "sampleRateHertz": "48000",
            "folderId": YANDEX_FOLDER_ID,
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(
                "https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize",
                headers=headers, data=data,
            )
            r.raise_for_status()
            return r.content