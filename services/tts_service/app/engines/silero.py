import asyncio
import logging
import os
import tempfile
import torch
import wave
import numpy as np

from .base import TTSEngine
from ..audio_utils import normalize_wav_to_mp3

logger = logging.getLogger(__name__)

_model = None
_lock = asyncio.Lock()

SILERO_SAMPLE_RATE = 24000

VOICE_MAP = {
    "aidar":  "aidar",
    "baya":   "baya",
    "kseniya":"kseniya",
    "xenia":  "xenia",
    "eugene": "eugene",
}


async def _get_model():
    global _model
    async with _lock:
        if _model is None:
            loop = asyncio.get_event_loop()
            _model = await loop.run_in_executor(None, _load_model)
    return _model


def _load_model():
    logger.info("Loading Silero TTS model (v5_ru)...")
    model, _ = torch.hub.load(
        repo_or_dir="snakers4/silero-models",
        model="silero_tts",
        language="ru",
        speaker="v5_ru",
        trust_repo=True,
    )
    model.to(torch.device("cpu"))
    logger.info("Silero model loaded")
    return model


class SileroEngine(TTSEngine):
    name = "silero"

    async def synthesize(self, text: str, voice_id: str) -> bytes:
        from ..text_normalize import clean_only
        text = clean_only(text)

        speaker = VOICE_MAP.get(voice_id)
        if not speaker:
            raise ValueError(f"Unknown Silero voice: {voice_id}")

        model = await _get_model()

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_wav:
            wav_path = tmp_wav.name

        try:
            loop = asyncio.get_event_loop()

            def _synth():
                with torch.no_grad():
                    audio = model.apply_tts(
                        text=text,
                        speaker=speaker,
                        sample_rate=SILERO_SAMPLE_RATE,
                        put_accent=True,
                        put_yo=True,
                    )
                arr = audio.detach().cpu().numpy()
                arr = np.clip(arr, -1.0, 1.0)
                pcm = (arr * 32767).astype(np.int16)

                with wave.open(wav_path, "wb") as wf:
                    wf.setnchannels(1)
                    wf.setsampwidth(2)
                    wf.setframerate(SILERO_SAMPLE_RATE)
                    wf.writeframes(pcm.tobytes())

            await loop.run_in_executor(None, _synth)
            return await normalize_wav_to_mp3(wav_path)
        finally:
            try:
                os.unlink(wav_path)
            except Exception:
                pass