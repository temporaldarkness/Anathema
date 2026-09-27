import json
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from .auth import verify_api_key
from .redis_client import get_redis
from . import crud
from .player import request_skip
from .storage import upload_song, delete_song as delete_song_file
from .utils import probe_duration_seconds, normalize_mp3
import uuid
import asyncio
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/songs")
async def list_songs(
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    search: str | None = None,
    caller: str = Depends(verify_api_key),
):
    return await crud.list_songs(limit=limit, offset=offset, search=search)


@router.get("/songs/{song_id}")
async def get_song(song_id: int, caller: str = Depends(verify_api_key)):
    song = await crud.get_song(song_id)
    if not song:
        raise HTTPException(404, "Song not found")
    return song


@router.post("/songs")
async def upload_new_song(
    file: UploadFile = File(...),
    title: str = Form(...),
    artist: str = Form(""),
    description: str = Form(""),
    uploaded_by: int = Form(None),
    uploaded_by_username: str = Form(None),
    caller: str = Depends(verify_api_key),
):
    if not file.filename.lower().endswith(".mp3"):
        raise HTTPException(400, "Only .mp3 files accepted")
    data = await file.read()
    if len(data) == 0:
        raise HTTPException(400, "Empty file")
    
    try:
        normalized = await normalize_mp3(data)
    except Exception as e:
        logger.exception("normalize failed")
        raise HTTPException(500, f"Failed to normalize audio: {e}")

    duration = await probe_duration_seconds(normalized)
    file_id = str(uuid.uuid4())

    await upload_song(file_id, normalized)

    song = await crud.insert_song(
        storage_file_id=file_id,
        title=title.strip(),
        artist=(artist or "").strip(),
        description=(description or "").strip(),
        duration_sec=duration,
        size_bytes=len(normalized),
        uploaded_by=uploaded_by,
        uploaded_by_username=uploaded_by_username,
    )
    return song


@router.patch("/songs/{song_id}")
async def patch_song(
    song_id: int,
    payload: dict,
    caller: str = Depends(verify_api_key),
):
    song = await crud.update_song(song_id, **payload)
    if not song:
        raise HTTPException(404, "Song not found")
    return song


@router.delete("/songs/{song_id}")
async def remove_song(song_id: int, caller: str = Depends(verify_api_key)):
    file_id = await crud.delete_song(song_id)
    if not file_id:
        raise HTTPException(404, "Song not found")
    await delete_song_file(file_id)
    return {"ok": True}


@router.get("/now")
async def now_playing(caller: str = Depends(verify_api_key)):
    r = await get_redis()
    raw = await r.get("radio:now_playing")
    if not raw:
        return {"status": "idle"}
    try:
        return json.loads(raw)
    except Exception:
        return {"status": "idle"}


@router.post("/skip")
async def skip(
    by: int = Form(None),
    by_username: str = Form(None),
    caller: str = Depends(verify_api_key),
):
    await request_skip(by, by_username)
    return {"ok": True}


@router.get("/history")
async def history(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    caller: str = Depends(verify_api_key),
):
    return await crud.get_history(limit=limit, offset=offset)

@router.post("/maintenance/normalize-all")
async def normalize_all(caller: str = Depends(verify_api_key)):
    asyncio.create_task(_normalize_all_bg())
    return {"ok": True, "message": "Normalization started in background"}


async def _normalize_all_bg():
    from .storage import download_song, upload_song
    from .utils import normalize_mp3, probe_duration_seconds
    from .db import get_pool

    logger.info("Starting background normalization of all songs")
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT id, storage_file_id, title FROM songs")
    total = len(rows)
    done = 0
    failed = 0

    for r in rows:
        try:
            data = await download_song(r["storage_file_id"])
            normalized = await normalize_mp3(data)
            duration = await probe_duration_seconds(normalized)

            import uuid
            new_file_id = str(uuid.uuid4())
            await upload_song(new_file_id, normalized)

            from .storage import delete_song as delete_from_minio
            await delete_from_minio(r["storage_file_id"])

            async with pool.acquire() as conn:
                await conn.execute(
                    "UPDATE songs SET storage_file_id = $1, duration_sec = $2, size_bytes = $3 WHERE id = $4",
                    new_file_id, duration, len(normalized), r["id"],
                )
            done += 1
        except Exception:
            logger.exception(f"normalize failed for song {r['id']}")
            failed += 1

        if (done + failed) % 10 == 0:
            logger.info(f"Normalize progress: {done+failed}/{total}")

    logger.info(f"Normalization finished: {done} ok, {failed} failed")