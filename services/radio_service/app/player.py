import asyncio
import json
import os
import logging
from datetime import datetime, timezone
from pathlib import Path

from .config import ICECAST_URL, CACHE_DIR
from .redis_client import get_redis
from .storage import download_song
from .crud import (
    pick_random_song, log_history_start, log_history_end,
    bump_play_count,
)

logger = logging.getLogger(__name__)

Path(CACHE_DIR).mkdir(parents=True, exist_ok=True)


class RadioState:
    process: asyncio.subprocess.Process | None = None
    current_song: dict | None = None
    current_history_id: int | None = None
    current_started_at: datetime | None = None
    skip_requested: bool = False
    skip_by: int | None = None
    skip_by_username: str | None = None


state = RadioState()


async def _ensure_cached(song: dict) -> str:
    path = os.path.join(CACHE_DIR, f"{song['storage_file_id']}.mp3")
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return path
    logger.info(f"Downloading {song['title']} from MinIO...")
    data = await download_song(song["storage_file_id"])
    tmp = path + ".part"
    with open(tmp, "wb") as f:
        f.write(data)
    os.replace(tmp, path)
    return path


async def _publish_now_playing(song: dict, started_at: datetime, status: str = "playing"):
    try:
        r = await get_redis()
        ends_at = None
        if song.get("duration_sec"):
            ends_at = (
                datetime.fromtimestamp(
                    started_at.timestamp() + float(song["duration_sec"]), tz=timezone.utc
                )
            ).isoformat()
        payload = {
            "status": status,
            "song_id": song["id"],
            "title": song["title"],
            "artist": song["artist"] or "",
            "started_at": started_at.isoformat(),
            "ends_at": ends_at,
            "duration_sec": song.get("duration_sec"),
        }
        await r.set("radio:now_playing", json.dumps(payload))
    except Exception as e:
        logger.warning(f"failed to publish now_playing: {e}")


async def _clear_now_playing():
    try:
        r = await get_redis()
        await r.set("radio:now_playing", json.dumps({"status": "idle"}))
    except Exception:
        pass


async def _play_song(song: dict) -> tuple[bool, float]:
    path = await _ensure_cached(song)
    started_at = datetime.now(timezone.utc)
    await _publish_now_playing(song, started_at, "playing")

    history_id = await log_history_start(song, started_at)
    state.current_history_id = history_id
    state.current_song = song
    state.current_started_at = started_at
    state.skip_requested = False
    state.skip_by = None
    state.skip_by_username = None

    proc = await asyncio.create_subprocess_exec(
        "ffmpeg",
        "-hide_banner",
        "-loglevel", "warning",
        "-re",
        "-i", path,
        "-c", "copy",
        "-f", "mp3",
        "-content_type", "audio/mpeg",
        ICECAST_URL,
        stderr=asyncio.subprocess.PIPE,
    )
    state.process = proc
    logger.info(f"▶ {song['title']} — {song.get('artist') or ''}")

    try:
        await proc.wait()
    except asyncio.CancelledError:
        proc.kill()
        await proc.wait()
        raise

    ended_at = datetime.now(timezone.utc)
    played = (ended_at - started_at).total_seconds()
    skipped = state.skip_requested

    await log_history_end(
        history_id, ended_at, skipped,
        state.skip_by, state.skip_by_username, played,
    )
    if not skipped:
        await bump_play_count(song["id"])

    state.process = None
    state.current_song = None
    state.current_history_id = None
    state.current_started_at = None

    return skipped, played


async def player_loop():
    logger.info("Radio player loop starting...")
    await asyncio.sleep(2)  # дать Icecast прогреться
    while True:
        try:
            song = await pick_random_song(exclude_ids=[])
            if not song:
                logger.warning("No songs in library, waiting...")
                await _clear_now_playing()
                await asyncio.sleep(15)
                continue
            await _play_song(song)
        except asyncio.CancelledError:
            logger.info("Player loop cancelled")
            if state.process:
                state.process.kill()
            raise
        except Exception as e:
            logger.exception(f"player loop error: {e}")
            await asyncio.sleep(5)


async def skip_command_listener():
    r = await get_redis()
    pubsub = r.pubsub()
    await pubsub.subscribe("radio:commands")
    logger.info("Skip command listener started")
    try:
        async for message in pubsub.listen():
            if message["type"] != "message":
                continue
            try:
                data = json.loads(message["data"])
            except Exception:
                continue
            if data.get("cmd") == "skip":
                if state.process is None or state.skip_requested:
                    continue
                state.skip_requested = True
                state.skip_by = data.get("by")
                state.skip_by_username = data.get("by_username")
                logger.info(f"Skip requested by {state.skip_by_username}")
                state.process.kill()
    finally:
        await pubsub.unsubscribe("radio:commands")


async def request_skip(by: int | None, by_username: str | None):
    r = await get_redis()
    await r.publish("radio:commands", json.dumps({
        "cmd": "skip", "by": by, "by_username": by_username,
    }))