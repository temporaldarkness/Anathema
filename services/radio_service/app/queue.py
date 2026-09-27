import json
from .redis_client import get_redis
from .crud import get_song
from .config import RADIO_QUEUE_KEY


async def push_song(song_id: int) -> bool:
    song = await get_song(song_id)
    if not song:
        return False
    r = await get_redis()
    await r.rpush(RADIO_QUEUE_KEY, str(song_id))
    return True


async def remove_song(song_id: int) -> bool:
    r = await get_redis()
    removed = await r.lrem(RADIO_QUEUE_KEY, 0, str(song_id))
    return removed > 0


async def clear_queue() -> int:
    r = await get_redis()
    n = await r.llen(RADIO_QUEUE_KEY)
    await r.delete(RADIO_QUEUE_KEY)
    return n


async def list_queue() -> list[dict]:
    r = await get_redis()
    ids = await r.lrange(RADIO_QUEUE_KEY, 0, -1)
    items = []
    for raw in ids:
        try:
            song = await get_song(int(raw))
        except Exception:
            song = None
        if song:
            items.append({
                "song_id": song["id"],
                "title": song["title"],
                "artist": song.get("artist") or "",
                "duration_sec": song.get("duration_sec"),
            })
    return items


async def pop_next_song_id() -> int | None:
    r = await get_redis()
    raw = await r.lpop(RADIO_QUEUE_KEY)
    if raw is None:
        return None
    try:
        return int(raw)
    except Exception:
        return None