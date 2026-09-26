import json
import logging
from datetime import datetime, timezone
from .db import get_pool
from .models import AuditEvent

logger = logging.getLogger(__name__)


def _parse_ts(value: str | None) -> datetime:
    if not value:
        return datetime.now(timezone.utc)
    try:
        s = value.replace("Z", "+00:00") if value.endswith("Z") else value
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return datetime.now(timezone.utc)


async def insert_event(event: AuditEvent) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            """
            INSERT INTO audit_log (
                event_id, created_at, source_service,
                actor_id, actor_username, actor_type,
                action, entity_type, entity_id,
                details, success, error, ip
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            ON CONFLICT (event_id) DO NOTHING
            """,
            event.event_id,
            _parse_ts(event.timestamp),
            event.source_service,
            event.actor_id,
            event.actor_username,
            event.actor_type,
            event.action,
            event.entity_type,
            event.entity_id,
            json.dumps(event.details or {}),
            event.success,
            event.error,
            event.ip,
        )
        return result == "INSERT 0 1"


async def list_audit(
    limit: int = 50,
    offset: int = 0,
    actor_id: int | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    action: str | None = None,
    success: bool | None = None,
    source_service: str | None = None,
    search: str | None = None,
):
    filters = []
    params = []
    i = 1

    if actor_id is not None:
        filters.append(f"actor_id = ${i}")
        params.append(actor_id); i += 1
    if entity_type:
        filters.append(f"entity_type = ${i}")
        params.append(entity_type); i += 1
    if entity_id:
        filters.append(f"entity_id = ${i}")
        params.append(entity_id); i += 1
    if action:
        filters.append(f"action = ${i}")
        params.append(action); i += 1
    if success is not None:
        filters.append(f"success = ${i}")
        params.append(success); i += 1
    if source_service:
        filters.append(f"source_service = ${i}")
        params.append(source_service); i += 1
    if search:
        filters.append(
            f"(actor_username ILIKE ${i} OR entity_id ILIKE ${i} OR error ILIKE ${i})"
        )
        params.append(f"%{search}%"); i += 1

    where = f"WHERE {' AND '.join(filters)}" if filters else ""

    pool = await get_pool()
    async with pool.acquire() as conn:
        total = await conn.fetchval(
            f"SELECT COUNT(*) FROM audit_log {where}", *params
        )
        rows = await conn.fetch(
            f"""
            SELECT id, event_id, created_at, received_at, source_service,
                   actor_id, actor_username, actor_type,
                   action, entity_type, entity_id,
                   details, success, error, ip
            FROM audit_log
            {where}
            ORDER BY created_at DESC, id DESC
            LIMIT ${i} OFFSET ${i + 1}
            """,
            *params, limit, offset,
        )

    items = []
    for r in rows:
        d = dict(r)
        if isinstance(d.get("details"), str):
            try:
                d["details"] = json.loads(d["details"])
            except Exception:
                d["details"] = {}
        if d.get("created_at"):
            d["created_at"] = d["created_at"].isoformat()
        if d.get("received_at"):
            d["received_at"] = d["received_at"].isoformat()
        if d.get("event_id") is not None:
            d["event_id"] = str(d["event_id"])
        if d.get("ip") is not None:
            d["ip"] = str(d["ip"])
        if d.get("actor_id") is not None:
            d["actor_id"] = str(d["actor_id"])
        items.append(d)

    return {"items": items, "total": total, "limit": limit, "offset": offset}


async def get_audit_entry(entry_id: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, event_id, created_at, received_at, source_service,
                   actor_id, actor_username, actor_type,
                   action, entity_type, entity_id,
                   details, success, error, ip
            FROM audit_log WHERE id = $1
            """,
            entry_id,
        )
    if not row:
        return None
    d = dict(row)
    if isinstance(d.get("details"), str):
        try:
            d["details"] = json.loads(d["details"])
        except Exception:
            d["details"] = {}
    if d.get("created_at"):
        d["created_at"] = d["created_at"].isoformat()
    if d.get("received_at"):
        d["received_at"] = d["received_at"].isoformat()
    if d.get("event_id") is not None:
        d["event_id"] = str(d["event_id"])
    if d.get("ip") is not None:
        d["ip"] = str(d["ip"])
    if d.get("actor_id") is not None:
        d["actor_id"] = str(d["actor_id"])
    return d


async def get_stats():
    pool = await get_pool()
    async with pool.acquire() as conn:
        total = await conn.fetchval("SELECT COUNT(*) FROM audit_log")
        last_24h = await conn.fetchval(
            "SELECT COUNT(*) FROM audit_log WHERE created_at > NOW() - INTERVAL '24 hours'"
        )
        failures = await conn.fetchval(
            "SELECT COUNT(*) FROM audit_log WHERE success = FALSE"
        )
        by_action = await conn.fetch(
            "SELECT action, COUNT(*) AS cnt FROM audit_log GROUP BY action ORDER BY cnt DESC"
        )
        by_entity = await conn.fetch(
            """
            SELECT entity_type, COUNT(*) AS cnt FROM audit_log
            WHERE entity_type IS NOT NULL
            GROUP BY entity_type ORDER BY cnt DESC
            """
        )
        by_source = await conn.fetch(
            "SELECT source_service, COUNT(*) AS cnt FROM audit_log GROUP BY source_service ORDER BY cnt DESC"
        )
        top_actors = await conn.fetch(
            """
            SELECT actor_id, actor_username, COUNT(*) AS cnt
            FROM audit_log
            WHERE actor_id IS NOT NULL
            GROUP BY actor_id, actor_username
            ORDER BY cnt DESC LIMIT 10
            """
        )

    return {
        "total": total,
        "last_24h": last_24h,
        "failures": failures,
        "by_action": [dict(r) for r in by_action],
        "by_entity": [dict(r) for r in by_entity],
        "by_source": [dict(r) for r in by_source],
        "top_actors": [dict(r) for r in top_actors],
    }

async def get_timeline(days: int = 7):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT date_trunc('day', created_at) AS bucket,
                   COUNT(*) AS total,
                   COUNT(*) FILTER (WHERE success = FALSE) AS failures
            FROM audit_log
            WHERE created_at >= $1
            GROUP BY bucket
            ORDER BY bucket ASC
            """,
            since,
        )
    return [
        {
            "bucket": r["bucket"].isoformat(),
            "total": r["total"],
            "failures": r["failures"],
        }
        for r in rows
    ]