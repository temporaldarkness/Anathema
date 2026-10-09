import logging
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from .auth import verify_api_key
from .voices import list_voices, get_voice
from . import templates as tpl
from . import cache
from .engines import synthesize
from .text_normalize import normalize_for_tts

logger = logging.getLogger(__name__)
router = APIRouter()


class SynthPayload(BaseModel):
    text: str = Field(..., min_length=1, max_length=500)
    voice: str = Field(..., min_length=1, max_length=32)


@router.get("/voices")
async def voices_list(caller: str = Depends(verify_api_key)):
    return {"voices": list_voices()}


@router.post("/synthesize")
async def synthesize_endpoint(payload: SynthPayload, caller: str = Depends(verify_api_key)):
    if not get_voice(payload.voice):
        raise HTTPException(400, f"Unknown voice: {payload.voice}")

    cached = cache.get(payload.text, payload.voice)
    if cached:
        return Response(content=cached, media_type="audio/mpeg", headers={"X-Cache": "hit"})

    try:
        mp3 = await synthesize(payload.text, payload.voice)
    except Exception as e:
        logger.exception("synthesis failed")
        raise HTTPException(500, f"Synthesis failed: {e}")

    cache.put(payload.text, payload.voice, mp3)
    return Response(content=mp3, media_type="audio/mpeg", headers={"X-Cache": "miss"})


class TrackAnnouncePayload(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    artist: str = Field("", max_length=200)
    description: str | None = Field(None, max_length=500)
    voice: str = Field(..., min_length=1, max_length=32)


@router.post("/announce/track")
async def announce_track(payload: TrackAnnouncePayload, caller: str = Depends(verify_api_key)):
    text = tpl.render_track(payload.title, payload.artist, payload.description)
    cached = cache.get(text, payload.voice)
    if cached:
        return Response(content=cached, media_type="audio/mpeg",
                        headers={"X-Cache": "hit", "X-Text": text.encode("ascii", "replace").decode()})
    mp3 = await synthesize(text, payload.voice)
    cache.put(text, payload.voice, mp3)
    return Response(content=mp3, media_type="audio/mpeg",
                    headers={"X-Cache": "miss", "X-Text": text.encode("ascii", "replace").decode()})


class SimpleVoicePayload(BaseModel):
    voice: str = Field(..., min_length=1, max_length=32)


@router.post("/announce/greeting")
async def announce_greeting(payload: SimpleVoicePayload, caller: str = Depends(verify_api_key)):
    text = tpl.render_greeting()
    cached = cache.get(text, payload.voice)
    if cached:
        return Response(content=cached, media_type="audio/mpeg", headers={"X-Cache": "hit"})
    mp3 = await synthesize(text, payload.voice)
    cache.put(text, payload.voice, mp3)
    return Response(content=mp3, media_type="audio/mpeg", headers={"X-Cache": "miss"})


@router.post("/announce/signoff")
async def announce_signoff(payload: SimpleVoicePayload, caller: str = Depends(verify_api_key)):
    text = tpl.render_signoff()
    cached = cache.get(text, payload.voice)
    if cached:
        return Response(content=cached, media_type="audio/mpeg", headers={"X-Cache": "hit"})
    mp3 = await synthesize(text, payload.voice)
    cache.put(text, payload.voice, mp3)
    return Response(content=mp3, media_type="audio/mpeg", headers={"X-Cache": "miss"})


class TranslitPayload(BaseModel):
    text: str = Field(..., min_length=1, max_length=500)


@router.post("/translit")
async def translit_endpoint(payload: TranslitPayload, caller: str = Depends(verify_api_key)):
    return {"text": normalize_for_tts(payload.text)}