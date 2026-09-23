import json
from .db import get_pool
from .redis_client import get_redis
from .models import UserReaction, UserReactionCreate
from .config import MEMORY_CACHE_TTL_SECONDS

async def get_user_reactions():
    redis_client = await get_redis()
    cached = await redis_client.get("user_reactions:all")
    if cached:
        items = json.loads(cached)
        return [UserReaction(**item) for item in items]

    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT id, user_uid, emoji_uid FROM user_reactions ORDER BY id")

    reactions = [UserReaction(id=r["id"], user_uid=r["user_uid"], emoji_uid=r["emoji_uid"]) for r in rows]

    await redis_client.setex(
        "user_reactions:all",
        MEMORY_CACHE_TTL_SECONDS,
        json.dumps([r.model_dump() for r in reactions], default=str)
    )
    return reactions

async def add_user_reaction(item: UserReactionCreate) -> UserReaction:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "INSERT INTO user_reactions (user_uid, emoji_uid) VALUES ($1, $2) RETURNING id, user_uid, emoji_uid",
            item.user_uid, item.emoji_uid
        )
    new_item = UserReaction(id=row["id"], user_uid=row["user_uid"], emoji_uid=row["emoji_uid"])

    redis_client = await get_redis()
    await redis_client.delete("user_reactions:all")
    return new_item

async def delete_user_reaction(reaction_id: int) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute("DELETE FROM user_reactions WHERE id = $1", reaction_id)
        if result == "DELETE 1":
            redis_client = await get_redis()
            await redis_client.delete("user_reactions:all")
            return True
    return False