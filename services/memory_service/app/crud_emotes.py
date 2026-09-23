import json
import logging
from .db import get_pool
from .models import EmoteBase
from .redis_client import get_redis
from .config import MEMORY_CACHE_TTL_SECONDS

CACHE_TTL = 300

async def get_emotes():
    redis_client = await get_redis()
    cached = await redis_client.get("emotes:all")
    if cached:
        return json.loads(cached)
    
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM emotes ORDER BY uid")
    emotes = [dict(row) for row in rows]
    await redis_client.setex(
        "emotes:all", 
        MEMORY_CACHE_TTL_SECONDS, 
        json.dumps(emotes, default=str)
    )
    return emotes

async def get_emote(uid: str):
    redis_client = await get_redis()
    cached = await redis_client.get(f"emote:{uid}")
    if cached:
        return json.loads(cached)
    
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM emotes WHERE uid = $1", uid)
    if not row:
        return None
    emote = dict(row)
    
    await redis_client.setex(
        f"emote:{uid}", 
        MEMORY_CACHE_TTL_SECONDS, 
        json.dumps(emote, default=str)
    )
    return emote

async def upsert_emote(emote: EmoteBase):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO emotes (uid, source, human_code, description)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (uid) DO UPDATE SET
                source = EXCLUDED.source,
                human_code = EXCLUDED.human_code,
                description = EXCLUDED.description
        """, emote.uid, emote.source, emote.human_code, emote.description)
    
    redis_client = await get_redis()
    await redis_client.delete("emotes:all")
    await redis_client.delete(f"emote:{emote.uid}")
    return emote

async def delete_emote(uid: str) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute("DELETE FROM emotes WHERE uid = $1", uid)
        if result == "DELETE 1":
            redis_client = await get_redis()
            await redis_client.delete("emotes:all")
            await redis_client.delete(f"emote:{uid}")
            return True
    return False