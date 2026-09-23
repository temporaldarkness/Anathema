import json
import logging
from .db import get_pool
from .models import Setting
from .redis_client import get_redis
from .config import MEMORY_CACHE_TTL_SECONDS

async def get_settings():
    redis_client = await get_redis()
    cached = await redis_client.get("settings:all")
    if cached:
        return json.loads(cached)
    
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM settings ORDER BY key")
    settings = [dict(row) for row in rows]
    await redis_client.setex(
        "settings:all", 
        MEMORY_CACHE_TTL_SECONDS, 
        json.dumps(settings, default=str)
    )
    return settings

async def get_setting(key: str):
    redis_client = await get_redis()
    cached = await redis_client.get(f"setting:{key}")
    if cached:
        return json.loads(cached)
    
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM settings WHERE key = $1", key)
    if not row:
        return None
    setting = dict(row)
    await redis_client.setex(f"setting:{key}", MEMORY_CACHE_TTL_SECONDS, json.dumps(setting))
    return setting

async def upsert_setting(setting: Setting):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO settings (key, value)
            VALUES ($1, $2)
            ON CONFLICT (key) DO UPDATE SET
                value = EXCLUDED.value
        """, setting.key, setting.value)
    
    redis_client = await get_redis()
    await redis_client.delete("settings:all")
    await redis_client.delete(f"setting:{setting.key}")
    return setting

async def delete_setting(key: str) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute("DELETE FROM settings WHERE key = $1", key)
        if result == "DELETE 1":
            redis_client = await get_redis()
            await redis_client.delete("settings:all")
            await redis_client.delete(f"setting:{key}")
            return True
    return False