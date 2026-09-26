import asyncpg
import logging
import asyncio
from asyncpg import Pool
from .config import DATABASE_URL

logger = logging.getLogger(__name__)

_pool: Pool | None = None

async def _wait_for_db(max_attempts: int = 10):
    for attempt in range(1, max_attempts + 1):
        try:
            conn = await asyncpg.connect(DATABASE_URL, timeout=5.0)
            await conn.execute("SELECT 1")
            await conn.close()
            logger.info(f"db reachable (attempt {attempt})")
            return
        except Exception as e:
            logger.warning(f"db not ready (attempt {attempt}/{max_attempts}): {e}")
            await asyncio.sleep(min(2 ** attempt, 10))
    raise RuntimeError("Database never became available")

async def init_db():
    global _pool
    if _pool is None:
        await _wait_for_db()
        _pool = await asyncpg.create_pool(
            DATABASE_URL,
            min_size=1,
            max_size=10,
            command_timeout=30,
        )

    async with _pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS audit_log (
                id BIGSERIAL PRIMARY KEY,
                event_id UUID UNIQUE NOT NULL,
                created_at TIMESTAMPTZ NOT NULL,
                received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                source_service TEXT NOT NULL,
                actor_id BIGINT,
                actor_username TEXT,
                actor_type TEXT,
                action TEXT NOT NULL,
                entity_type TEXT,
                entity_id TEXT,
                details JSONB NOT NULL DEFAULT '{}',
                success BOOLEAN NOT NULL DEFAULT TRUE,
                error TEXT,
                ip INET
            )
        """)
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_log (created_at DESC)"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log (actor_id, created_at DESC)"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log (entity_type, entity_id)"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log (action)"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_audit_failures ON audit_log (created_at DESC) WHERE success = FALSE"
        )
        
    
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS api_usage (
                id BIGSERIAL PRIMARY KEY,
                event_id TEXT UNIQUE NOT NULL,
                created_at TIMESTAMPTZ NOT NULL,
                received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                source TEXT NOT NULL,
                model TEXT NOT NULL,
                tokens_in BIGINT DEFAULT 0,
                tokens_out BIGINT DEFAULT 0,
                cost_usd NUMERIC(12, 6) DEFAULT 0,
                correlation_id TEXT,
                user_id BIGINT,
                success BOOLEAN DEFAULT TRUE,
                error TEXT
            )
        """)
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_usage_created ON api_usage (created_at DESC)")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_usage_model ON api_usage (model)")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_usage_source ON api_usage (source)")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_usage_user ON api_usage (user_id, created_at DESC)")
        logger.info("audit_db initialized")
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
        logger.info("audit_db pool closed")