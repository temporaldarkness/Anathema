import json
import logging
from .db import get_pool
from .models import LTMItem, LTMItemCreate
from .redis_client import get_redis
from .config import MEMORY_CACHE_TTL_SECONDS

logger = logging.getLogger(__name__)

async def get_facts():
    redis_client = await get_redis()
    cached = await redis_client.get('ltm:all')
    if cached:
        items_data = json.loads(cached)
        return [LTMItem(**item) for item in items_data]
    
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM long_term_memory ORDER BY id")
    items = [LTMItem(id=r["id"], fact=r["fact"], created_at=r["created_at"]) for r in rows]
    
    await redis_client.setex(
        'ltm:all',
        MEMORY_CACHE_TTL_SECONDS,
        json.dumps([item.model_dump() for item in items], default=str)
    )
    return items

async def add_fact(data: LTMItemCreate):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "INSERT INTO long_term_memory (fact) VALUES ($1) RETURNING id, fact, created_at",
            data.fact
        )
    new_item = LTMItem(id=row["id"], fact=row["fact"], created_at=row["created_at"])
    
    redis_client = await get_redis()
    await redis_client.delete('ltm:all')
    
    return new_item

async def delete_fact(fact_id: int) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute("DELETE FROM long_term_memory WHERE id = $1", fact_id)
        if result == "DELETE 1":
            redis_client = await get_redis()
            await redis_client.delete('ltm:all')
            return True
    return False