import asyncio
import logging
import os
from datetime import datetime, timezone
import redis.asyncio as redis
from .config import REDIS_URL

logger = logging.getLogger(__name__)
_client = None


async def _get_redis():
    global _client
    if _client is None:
        _client = await redis.from_url(REDIS_URL, decode_responses=True)
    return _client


async def heartbeat_loop(service_name: str, interval: int = 15, ttl: int = 45):
    while True:
        try:
            r = await _get_redis()
            await r.setex(
                f"heartbeat:{service_name}",
                ttl,
                datetime.now(timezone.utc).isoformat(),
            )
        except Exception as e:
            logger.warning(f"heartbeat failed: {e}")
        await asyncio.sleep(interval)