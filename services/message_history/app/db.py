import asyncpg
import logging
from asyncpg import Pool
from .config import POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB, POSTGRES_HOST, POSTGRES_PORT

logger = logging.getLogger(__name__)

DATABASE_URL = f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"

_pool: Pool = None

async def init_db():
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=10)
    
    async with _pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                message_id TEXT UNIQUE NOT NULL,
                channel_id BIGINT NOT NULL,
                user_id BIGINT NOT NULL,
                username TEXT NOT NULL,
                content TEXT,
                timestamp TIMESTAMPTZ NOT NULL,
                reply_to_message_id TEXT,
                attachments JSONB DEFAULT '[]'
            )
        """)
        
        await conn.execute("""CREATE INDEX IF NOT EXISTS idx_messages_channel_timestamp 
            ON messages (channel_id, timestamp DESC)""")
        
        await conn.execute("""CREATE INDEX IF NOT EXISTS idx_messages_message_id 
            ON messages (message_id)""")
        
        await conn.execute("""CREATE INDEX IF NOT EXISTS idx_messages_user_id 
            ON messages (user_id)""")
        
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages (timestamp DESC)"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_messages_user_ts ON messages (user_id, timestamp DESC)"
        )
        
        return _pool

async def get_pool() -> Pool:
    if _pool is None:
        await init_db()
    return _pool

async def close_db():
    global _pool
    if _pool:
        await _pool.close()
        _pool = None