import logging
from datetime import datetime, timezone, timedelta
from .db import get_pool
from .models import UsageEvent

logger = logging.getLogger(__name__)


def _parse_ts(value: str | None) -> datetime:
    if not value:
        return datetime.now(timezone.utc)
    try:
        s = value.replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return datetime.now(timezone.utc)


async def insert_usage(event: UsageEvent) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            """
            INSERT INTO api_usage (
                event_id, created_at, source, model,
                tokens_in, tokens_out, cost_usd,
                correlation_id, user_id, success, error
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (event_id) DO NOTHING
            """,
            event.event_id, _parse_ts(event.timestamp),
            event.source, event.model,
            event.tokens_in, event.tokens_out, event.cost_usd,
            event.correlation_id, event.user_id, event.success, event.error,
        )
        return result == "INSERT 0 1"


async def get_usage_summary(days: int = 7):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT
                COUNT(*) AS calls,
                COALESCE(SUM(cost_usd), 0) AS cost,
                COALESCE(SUM(tokens_in), 0) AS tokens_in,
                COALESCE(SUM(tokens_out), 0) AS tokens_out,
                COUNT(*) FILTER (WHERE success = FALSE) AS failures
            FROM api_usage
            WHERE created_at >= $1
            """,
            since,
        )
    return {
        "calls": row["calls"],
        "cost_usd": float(row["cost"]),
        "tokens_in": row["tokens_in"],
        "tokens_out": row["tokens_out"],
        "failures": row["failures"],
    }


async def get_usage_by_model(days: int = 7):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT model,
                   COUNT(*) AS calls,
                   COALESCE(SUM(cost_usd), 0) AS cost,
                   COALESCE(SUM(tokens_in), 0) AS tokens_in,
                   COALESCE(SUM(tokens_out), 0) AS tokens_out
            FROM api_usage
            WHERE created_at >= $1
            GROUP BY model
            ORDER BY cost DESC
            """,
            since,
        )
    return [
        {
            "model": r["model"],
            "calls": r["calls"],
            "cost_usd": float(r["cost"]),
            "tokens_in": r["tokens_in"],
            "tokens_out": r["tokens_out"],
        }
        for r in rows
    ]


async def get_usage_by_source(days: int = 7):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT source,
                   COUNT(*) AS calls,
                   COALESCE(SUM(cost_usd), 0) AS cost
            FROM api_usage
            WHERE created_at >= $1
            GROUP BY source
            ORDER BY cost DESC
            """,
            since,
        )
    return [{"source": r["source"], "calls": r["calls"], "cost_usd": float(r["cost"])} for r in rows]


async def get_usage_timeline(days: int = 7):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT date_trunc('day', created_at) AS bucket,
                   COUNT(*) AS calls,
                   COALESCE(SUM(cost_usd), 0) AS cost
            FROM api_usage
            WHERE created_at >= $1
            GROUP BY bucket
            ORDER BY bucket ASC
            """,
            since,
        )
    return [
        {"bucket": r["bucket"].isoformat(), "calls": r["calls"], "cost_usd": float(r["cost"])}
        for r in rows
    ]


async def get_top_users_by_cost(days: int = 7, limit: int = 10):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT user_id, COUNT(*) AS calls, COALESCE(SUM(cost_usd), 0) AS cost
            FROM api_usage
            WHERE created_at >= $1 AND user_id IS NOT NULL
            GROUP BY user_id
            ORDER BY cost DESC
            LIMIT $2
            """,
            since, limit,
        )
    return [
        {"user_id": r["user_id"], "calls": r["calls"], "cost_usd": float(r["cost"])}
        for r in rows
    ]