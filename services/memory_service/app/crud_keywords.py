import json
from .db import get_pool
from .redis_client import get_redis
from .models import KeywordReaction, KeywordReactionCreate
from .config import MEMORY_CACHE_TTL_SECONDS

async def get_keywords():
    redis_client = await get_redis()
    cached = await redis_client.get("keywords:all")
    if cached:
        items = json.loads(cached)
        return [KeywordReaction(**item) for item in items]

    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT id, keyword, emoji_uid FROM keyword_list ORDER BY id")

    keywords = [KeywordReaction(id=r["id"], keyword=r["keyword"], emoji_uid=r["emoji_uid"]) for r in rows]

    await redis_client.setex(
        "keywords:all",
        MEMORY_CACHE_TTL_SECONDS,
        json.dumps([k.model_dump() for k in keywords], default=str)
    )
    return keywords

async def add_keyword(item: KeywordReactionCreate) -> KeywordReaction:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "INSERT INTO keyword_list (keyword, emoji_uid) VALUES ($1, $2) RETURNING id, keyword, emoji_uid",
            item.keyword, item.emoji_uid
        )
    new_item = KeywordReaction(id=row["id"], keyword=row["keyword"], emoji_uid=row["emoji_uid"])

    redis_client = await get_redis()
    await redis_client.delete("keywords:all")
    return new_item

async def delete_keyword(keyword_id: int) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute("DELETE FROM keyword_list WHERE id = $1", keyword_id)
        if result == "DELETE 1":
            redis_client = await get_redis()
            await redis_client.delete("keywords:all")
            return True
    return False