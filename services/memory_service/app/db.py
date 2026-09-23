import asyncpg
import logging
from asyncpg import Pool
from .config import POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB, POSTGRES_HOST, POSTGRES_PORT, DEFAULT_SETTINGS, MEMORY_CACHE_TTL_SECONDS

logger = logging.getLogger(__name__)

DATABASE_URL = f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"

_pool: Pool = None

async def init_db():
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=10)
    
    async with _pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS long_term_memory (
                id SERIAL PRIMARY KEY,
                fact TEXT NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            )
        """)
        
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                uid TEXT PRIMARY KEY,
                username TEXT NOT NULL,
                user_id BIGINT UNIQUE NOT NULL,
                aliases JSONB NOT NULL DEFAULT '[]',
                gender SMALLINT,
                orientation SMALLINT,
                allowed BOOLEAN DEFAULT FALSE
            )
        """)
        
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS channels (
                uid TEXT PRIMARY KEY,
                channel_id BIGINT UNIQUE NOT NULL,
                human_name TEXT,
                human_topic TEXT,
                prompt TEXT
            )
        """)
        
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS emotes (
                uid TEXT PRIMARY KEY,
                source TEXT NOT NULL,
                human_code TEXT,
                description TEXT
            )
        """)
        
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS keyword_list (
                id SERIAL PRIMARY KEY,
                keyword TEXT NOT NULL,
                emoji_uid TEXT NOT NULL REFERENCES emotes(uid) ON DELETE CASCADE
            )
        """)
        
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS user_reactions (
                id SERIAL PRIMARY KEY,
                user_uid TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
                emoji_uid TEXT NOT NULL REFERENCES emotes(uid) ON DELETE CASCADE
            )
        """)
        
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        """)
        
        for key, default_value in DEFAULT_SETTINGS.items():
            exists = await conn.fetchval("SELECT 1 FROM settings WHERE key = $1", key)
            if not exists:
                await conn.execute(
                    "INSERT INTO settings (key, value) VALUES ($1, $2)",
                    key, default_value
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