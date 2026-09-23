import json
import logging
from .db import get_pool
from .models import Message, MessageInDB
from .redis_client import get_redis
from .config import HISTORY_CACHE_LIMIT, REDIS_HISTORY_PREFIX

async def save_message(msg: Message):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO messages (message_id, channel_id, user_id, username, content, timestamp, 
                reply_to_message_id, attachments)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (message_id) DO NOTHING
        """, msg.message_id, msg.channel_id, msg.user_id, msg.username, msg.content, msg.timestamp,
            msg.reply_to_message_id, json.dumps(msg.attachments))
            
    
    redis = await get_redis()
    key = f"{REDIS_HISTORY_PREFIX}{msg.channel_id}"
    msg_data = json.dumps({
        "message_id": msg.message_id,
        "user_id": msg.user_id,
        "username": msg.username,
        "content": msg.content,
        "timestamp": msg.timestamp,
        "reply_to_message_id": msg.reply_to_message_id,
    }, default=str)
    
    await redis.lpush(key, msg_data)
    await redis.ltrim(key, 0, int(HISTORY_CACHE_LIMIT) - 1)
    return msg

async def get_history(channel_id: int, limit: int = 50, before_timestamp: str = None):
    redis = await get_redis()
    key = f"{REDIS_HISTORY_PREFIX}{channel_id}"
    
    items = await redis.lrange(key, 0, limit - 1)
    if items:
        return [json.loads(item) for item in items]
    
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT message_id, user_id, username, content, timestamp, reply_to_message_id
            FROM messages
            WHERE channel_id = $1
            ORDER BY timestamp DESC
            LIMIT $2
        """, channel_id, limit)
    
    if not rows:
        return []
    
    messages = []
    for row in rows:
        msg_data = {
            "message_id": row["message_id"],
            "user_id": row["user_id"],
            "username": row["username"],
            "content": row["content"],
            "timestamp": row["timestamp"].isoformat(),
            "reply_to_message_id": row["reply_to_message_id"]
        }
        messages.append(msg_data)
    
    await redis.delete(key)
    for msg_data in reversed(messages):
        await redis.lpush(key, json.dumps(msg_data))
    await redis.ltrim(key, 0, limit - 1)
    
    return messages