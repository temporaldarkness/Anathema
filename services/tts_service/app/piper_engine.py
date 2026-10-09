import asyncio
import logging
import os
import subprocess
import tempfile

from .config import PIPER_VOICES_DIR, OUTPUT_AR, OUTPUT_AC, OUTPUT_BITRATE, TTS_LENGTH_SCALE, TTS_NOISE_SCALE
from .voices import get_voice
from .text_normalize import normalize_for_tts

logger = logging.getLogger(__name__)


async def synthesize(text: str, voice_id: str) -> bytes:
    text = normalize_for_tts(text)
    voice = get_voice(voice_id)
    if not voice:
        raise ValueError(f"Unknown voice: {voice_id}")

    model_path = os.path.join(PIPER_VOICES_DIR, f"{voice['model']}.onnx")
    if not os.path.exists(model_path):
        raise FileNotFoundError(f"Model not found: {model_path}")

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_wav:
        wav_path = tmp_wav.name

    try:
        proc = await asyncio.create_subprocess_exec(
            "piper",
            "--model", model_path,
            "--output_file", wav_path,
            "--length_scale", str(TTS_LENGTH_SCALE),
            "--noise_scale", str(TTS_NOISE_SCALE),
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await proc.communicate(text.encode("utf-8"))
        if proc.returncode != 0:
            raise RuntimeError(f"piper failed: {stderr.decode()[:300]}")

        mp3_bytes = await _normalize_to_mp3(wav_path)
        return mp3_bytes
    finally:
        try:
            os.unlink(wav_path)
        except Exception:
            pass


async def _normalize_to_mp3(wav_path: str) -> bytes:
    proc = await asyncio.create_subprocess_exec(
        "ffmpeg",
        "-hide_banner", "-loglevel", "error",
        "-i", wav_path,
        "-ar", str(OUTPUT_AR),
        "-ac", str(OUTPUT_AC),
        "-b:a", OUTPUT_BITRATE,
        "-write_xing", "0",
        "-write_id3v2", "0",
        "-id3v2_version", "0",
        "-map_metadata", "-1",
        "-f", "mp3",
        "-",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {stderr.decode()[:300]}")
    return stdout