import logging
import os
import random
import httpx
from .config import TTS_SERVICE_URL, RADIO_TTS_CLIENT_KEY

logger = logging.getLogger(__name__)

_client = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            base_url=TTS_SERVICE_URL,
            headers={"X-API-Key": RADIO_TTS_CLIENT_KEY},
            timeout=30.0,
        )
    return _client


async def close_client():
    global _client
    if _client:
        await _client.aclose()
        _client = None


async def fetch_announce(song: dict, voice: str) -> bytes | None:
    title_for_tts = song.get("announce_title") or song["title"]
    try:
        r = await _get_client().post("/announce/track", json={
            "title": title_for_tts,
            "artist": song.get("artist") or "",
            "description": song.get("description") or None,
            "voice": voice,
        })
        r.raise_for_status()
        return r.content
    except Exception:
        logger.exception("announce fetch failed")
        return None


async def fetch_greeting(voice: str) -> bytes | None:
    try:
        r = await _get_client().post("/announce/greeting", json={"voice": voice})
        r.raise_for_status()
        return r.content
    except Exception:
        logger.exception("greeting fetch failed")
        return None


async def fetch_signoff(voice: str) -> bytes | None:
    try:
        r = await _get_client().post("/announce/signoff", json={"voice": voice})
        r.raise_for_status()
        return r.content
    except Exception:
        logger.exception("signoff fetch failed")
        return None


def pick_voice(voices: list[str]) -> str:
    if not voices:
        return "dmitri"
    return random.choice(voices)