import json
import logging
from .db import get_pool
from .models import UserBase
from .redis_client import get_redis
from .config import MEMORY_CACHE_TTL_SECONDS

async def get_users():
    redis_client = await get_redis()
    cached = await redis_client.get("users:all")
    if cached:
        return json.loads(cached)
    
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM users ORDER BY uid")
    users = [dict(row) for row in rows]
    
    for u in users:
        u['aliases'] = json.loads(u['aliases']) if isinstance(u['aliases'], str) else u['aliases']
    await redis_client.setex(
        "users:all", 
        MEMORY_CACHE_TTL_SECONDS, 
        json.dumps(users, default=str)
    )
    return users

async def get_user(uid: str):
    redis_client = await get_redis()
    cached = await redis_client.get(f"user:{uid}")
    if cached:
        return json.loads(cached)
    
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM users WHERE uid = $1", uid)
    if not row:
        return None
    user = dict(row)
    user['aliases'] = json.loads(user['aliases']) if isinstance(user['aliases'], str) else user['aliases']
    
    await redis_client.setex(
        f"user:{uid}", 
        MEMORY_CACHE_TTL_SECONDS, 
        json.dumps(user, default=str)
    )
    return user

async def get_user_discord(user_id: int):
    redis_client = await get_redis()
    cached = await redis_client.get(f"user:discord:{user_id}")
    if cached:
        return json.loads(cached)
    
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM users WHERE user_id = $1", user_id)
    if not row:
        return None
    user = dict(row)
    user['aliases'] = json.loads(user['aliases']) if isinstance(user['aliases'], str) else user['aliases']
    
    await redis_client.setex(
        f"user:discord_{user_id}", 
        MEMORY_CACHE_TTL_SECONDS, 
        json.dumps(user, default=str)
    )
    return user

async def upsert_user(user: UserBase):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO users (uid, username, user_id, aliases, gender, orientation)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (uid) DO UPDATE SET
                username = EXCLUDED.username,
                user_id = EXCLUDED.user_id,
                aliases = EXCLUDED.aliases,
                gender = EXCLUDED.gender,
                orientation = EXCLUDED.orientation
        """, user.uid, user.username, user.user_id, json.dumps(user.aliases), user.gender, user.orientation)
    
    redis_client = await get_redis()
    await redis_client.delete("users:all")
    await redis_client.delete(f"user:{user.uid}")
    return user

async def delete_user(uid: str) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute("DELETE FROM users WHERE uid = $1", uid)
        if result == "DELETE 1":
            redis_client = await get_redis()
            await redis_client.delete("users:all")
            await redis_client.delete(f"user:{uid}")
            return True
    return False