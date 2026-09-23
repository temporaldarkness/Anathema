import redis.asyncio as redis
import logging
from .config import REDIS_URL

logger = logging.getLogger(__name__)

_redis = None

async def get_redis():
    global _redis
    if _redis is None:
        _redis = await redis.from_url(REDIS_URL, decode_responses=True)
        await _redis.ping()
        logger.info("Redis connected")
    return _redis

async def close_redis():
    global _redis
    if _redis:
        await _redis.close()
        _redis = None