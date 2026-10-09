import random
from datetime import datetime, timezone
from .db import get_pool


async def insert_song(
    storage_file_id: str,
    title: str,
    artist: str,
    description: str,
    duration_sec: float | None,
    size_bytes: int,
    uploaded_by: int | None,
    uploaded_by_username: str | None,
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            INSERT INTO songs (
                storage_file_id, title, artist, description,
                duration_sec, size_bytes, uploaded_by, uploaded_by_username
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
            RETURNING *
        """, storage_file_id, title, artist, description,
             duration_sec, size_bytes, uploaded_by, uploaded_by_username)
    return dict(row)


async def list_songs(limit: int = 200, offset: int = 0, search: str | None = None):
    pool = await get_pool()
    where = ""
    params = []
    if search:
        where = "WHERE (title ILIKE $1 OR artist ILIKE $1 OR description ILIKE $1)"
        params.append(f"%{search}%")
    params.extend([limit, offset])
    async with pool.acquire() as conn:
        total = await conn.fetchval(f"SELECT COUNT(*) FROM songs {where}", *params[:-2])
        rows = await conn.fetch(
            f"SELECT * FROM songs {where} ORDER BY uploaded_at DESC LIMIT ${len(params)-1} OFFSET ${len(params)}",
            *params,
        )
    return {"items": [dict(r) for r in rows], "total": total, "limit": limit, "offset": offset}


async def get_song(song_id: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM songs WHERE id = $1", song_id)
    return dict(row) if row else None


async def update_song(song_id: int, **fields):
    if not fields:
        return await get_song(song_id)
    allowed = {"title", "artist", "description", "announce_title"}
    keys = [k for k in fields if k in allowed and fields[k] is not None]
    if not keys:
        return await get_song(song_id)
    set_clause = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(keys))
    values = [fields[k] for k in keys]
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            f"UPDATE songs SET {set_clause} WHERE id = $1 RETURNING *",
            song_id, *values,
        )
    return dict(row) if row else None


async def delete_song(song_id: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("DELETE FROM songs WHERE id = $1 RETURNING storage_file_id", song_id)
    return row["storage_file_id"] if row else None


async def pick_random_song(exclude_ids: list[int], recent_n: int = 20):
    pool = await get_pool()
    async with pool.acquire() as conn:
        recent = await conn.fetch("""
            SELECT song_id FROM radio_history
            WHERE song_id IS NOT NULL
            ORDER BY started_at DESC LIMIT $1
        """, recent_n)
        recent_ids = [r["song_id"] for r in recent]
        recent_ids.extend(exclude_ids)

        if recent_ids:
            row = await conn.fetchrow("""
                SELECT * FROM songs
                WHERE id <> ALL($1::bigint[])
                ORDER BY RANDOM() LIMIT 1
            """, recent_ids)
        else:
            row = None

        if row is None:
            row = await conn.fetchrow("SELECT * FROM songs ORDER BY RANDOM() LIMIT 1")
    return dict(row) if row else None


async def log_history_start(song: dict, started_at: datetime):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            INSERT INTO radio_history (song_id, song_title, song_artist, started_at)
            VALUES ($1, $2, $3, $4)
            RETURNING id
        """, song["id"], song["title"], song["artist"], started_at)
    return row["id"]


async def log_history_end(history_id: int, ended_at: datetime, skipped: bool, skipped_by: int | None, skipped_by_username: str | None, duration_played: float):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("""
            UPDATE radio_history
            SET ended_at = $2, skipped = $3,
                skipped_by = $4, skipped_by_username = $5,
                duration_played_sec = $6
            WHERE id = $1
        """, history_id, ended_at, skipped, skipped_by, skipped_by_username, duration_played)


async def bump_play_count(song_id: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE songs SET play_count = play_count + 1, last_played_at = NOW() WHERE id = $1",
            song_id,
        )


async def get_history(limit: int = 50, offset: int = 0):
    pool = await get_pool()
    async with pool.acquire() as conn:
        total = await conn.fetchval("SELECT COUNT(*) FROM radio_history")
        rows = await conn.fetch("""
            SELECT * FROM radio_history
            ORDER BY started_at DESC LIMIT $1 OFFSET $2
        """, limit, offset)
    return {"items": [dict(r) for r in rows], "total": total, "limit": limit, "offset": offset}