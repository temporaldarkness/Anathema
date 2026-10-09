import asyncpg
from asyncpg import Pool
from .config import DATABASE_URL

_pool: Pool | None = None


async def init_db():
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=10)

    async with _pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS songs (
                id BIGSERIAL PRIMARY KEY,
                storage_file_id TEXT UNIQUE NOT NULL,
                title TEXT NOT NULL,
                artist TEXT DEFAULT '',
                description TEXT DEFAULT '',
                duration_sec DOUBLE PRECISION,
                size_bytes BIGINT,
                uploaded_at TIMESTAMPTZ DEFAULT NOW(),
                uploaded_by BIGINT,
                uploaded_by_username TEXT,
                play_count INT DEFAULT 0,
                last_played_at TIMESTAMPTZ
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS radio_history (
                id BIGSERIAL PRIMARY KEY,
                song_id BIGINT REFERENCES songs(id) ON DELETE SET NULL,
                song_title TEXT,
                song_artist TEXT,
                started_at TIMESTAMPTZ NOT NULL,
                ended_at TIMESTAMPTZ,
                duration_played_sec DOUBLE PRECISION,
                skipped BOOLEAN DEFAULT FALSE,
                skipped_by BIGINT,
                skipped_by_username TEXT
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS radio_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        """)
        defaults = {
            "announcements_enabled": "true",
            "announcement_voices": '["aidar", "baya", "kseniya"]',
            "greeting_enabled": "true",
            "greeting_interval_minutes": "30",
        }
        for k, v in defaults.items():
            await conn.execute(
                "INSERT INTO radio_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING",
                k, v
            )
        
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_history_started ON radio_history (started_at DESC)"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_songs_last_played ON songs (last_played_at DESC NULLS LAST)"
        )
        
        await conn.execute("""
            ALTER TABLE songs
            ADD COLUMN IF NOT EXISTS announce_title TEXT
        """)
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