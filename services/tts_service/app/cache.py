import hashlib
import logging
import os
from pathlib import Path
from .config import TTS_LENGTH_SCALE, TTS_NOISE_SCALE, CACHE_DIR, TTS_CACHE_TTL_DAYS

logger = logging.getLogger(__name__)
Path(CACHE_DIR).mkdir(parents=True, exist_ok=True)


def _key(text: str, voice_id: str) -> str:
    key_data = f"{voice_id}|{TTS_LENGTH_SCALE}|{TTS_NOISE_SCALE}|{text}"
    h = hashlib.sha1(key_data.encode("utf-8")).hexdigest()
    return h


def get(text: str, voice_id: str) -> bytes | None:
    path = os.path.join(CACHE_DIR, f"{_key(text, voice_id)}.mp3")
    if os.path.exists(path):
        try:
            with open(path, "rb") as f:
                return f.read()
        except Exception:
            return None
    return None


def put(text: str, voice_id: str, data: bytes) -> None:
    path = os.path.join(CACHE_DIR, f"{_key(text, voice_id)}.mp3")
    try:
        tmp = path + ".part"
        with open(tmp, "wb") as f:
            f.write(data)
        os.replace(tmp, path)
    except Exception:
        logger.exception("failed to write cache")

async def cleanup_loop(interval_hours: int = 24):
    while True:
        try:
            cutoff = time.time() - TTS_CACHE_TTL_DAYS * 86400
            removed = 0
            total = 0
            for name in os.listdir(CACHE_DIR):
                if not name.endswith(".mp3"):
                    continue
                path = os.path.join(CACHE_DIR, name)
                try:
                    total += 1
                    if os.path.getmtime(path) < cutoff:
                        os.unlink(path)
                        removed += 1
                except FileNotFoundError:
                    continue
                except Exception:
                    logger.exception(f"cleanup failed for {path}")
            logger.info(f"TTS cache cleanup: removed {removed} of {total} files")
        except Exception:
            logger.exception("cache cleanup failed")
        await asyncio.sleep(interval_hours * 3600)