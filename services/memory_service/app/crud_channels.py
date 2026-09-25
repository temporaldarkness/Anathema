import json
import logging
from .db import get_pool
from .models import ChannelBase
from .redis_client import get_redis
from .config import MEMORY_CACHE_TTL_SECONDS

async def get_channels():
    redis_client = await get_redis()
    cached = await redis_client.get("channels:all")
    if cached:
        return json.loads(cached)
    
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM channels ORDER BY uid")
    channels = [dict(row) for row in rows]
    for c in channels:
        c['channel_id'] = str(c['channel_id'])
    await redis_client.setex(
        "channels:all", 
        MEMORY_CACHE_TTL_SECONDS, 
        json.dumps(channels, default=str)
    )
    return channels

async def get_channel(uid: str):
    redis_client = await get_redis()
    cached = await redis_client.get(f"channel:{uid}")
    if cached:
        return json.loads(cached)
    
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM channels WHERE uid = $1", uid)
    if not row:
        return None
    channel = dict(row)
    channel['channel_id'] = str(channel['channel_id'])
    
    await redis_client.setex(
        f"channel:{uid}", 
        MEMORY_CACHE_TTL_SECONDS, 
        json.dumps(channel, default=str)
    )
    return channel

async def get_channel_discord(channel_id: int):
    redis_client = await get_redis()
    cached = await redis_client.get(f"channel:discord:{channel_id}")
    if cached:
        return json.loads(cached)
    
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM channels WHERE channel_id = $1", channel_id)
    if not row:
        return None
    channel = dict(row)
    channel['channel_id'] = str(channel['channel_id']) 
    
    await redis_client.setex(
        f"channel:discord:{channel_id}", 
        MEMORY_CACHE_TTL_SECONDS, 
        json.dumps(channel, default=str)
    )
    return channel

async def upsert_channel(channel: ChannelBase):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO channels (uid, channel_id, human_name, human_topic, prompt)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (uid) DO UPDATE SET
                channel_id = EXCLUDED.channel_id,
                human_name = EXCLUDED.human_name,
                human_topic = EXCLUDED.human_topic,
                prompt = EXCLUDED.prompt
        """, channel.uid, channel.channel_id, channel.human_name, channel.human_topic, channel.prompt)
    
    redis_client = await get_redis()
    await redis_client.delete("channels:all")
    await redis_client.delete(f"channel:{channel.uid}")
    return channel

async def delete_channel(uid: str) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute("DELETE FROM channels WHERE uid = $1", uid)
        if result == "DELETE 1":
            redis_client = await get_redis()
            await redis_client.delete("channels:all")
            await redis_client.delete(f"channel:{uid}")
            return True
    return False