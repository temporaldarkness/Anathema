import asyncpg
import logging
from asyncpg import Pool
from .config import DATABASE_URL

logger = logging.getLogger(__name__)

_pool: Pool | None = None


async def init_db():
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=10)

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