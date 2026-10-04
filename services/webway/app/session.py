import json
import logging
import secrets
from datetime import datetime, timezone
from typing import Optional

import redis.asyncio as redis

from .config import (
    REDIS_URL,
    SESSION_TTL_DAYS,
    SESSION_SHORT_TTL_HOURS,
)

logger = logging.getLogger(__name__)

_redis = None


async def get_redis():
    global _redis
    if _redis is None:
        _redis = await redis.from_url(REDIS_URL, decode_responses=True)
    return _redis


def _session_key(sid: str) -> str:
    return f"session:{sid}"


def _user_sessions_key(user_id: int) -> str:
    return f"user_sessions:{user_id}"


def _new_sid() -> str:
    return secrets.token_urlsafe(32)


async def create_session(
    user_id: int,
    username: str,
    is_admin: bool,
    *,
    remember: bool = True,
    user_agent: str | None = None,
    avatar_url: str | None = None,
    ip: str | None = None,
) -> tuple[str, int]:
    ttl_seconds = (
        SESSION_TTL_DAYS * 86400
        if remember
        else SESSION_SHORT_TTL_HOURS * 3600
    )
    sid = _new_sid()
    now = datetime.now(timezone.utc).isoformat()
    data = {
        "user_id": user_id,
        "username": username,
        "avatar_url": (avatar_url or ""),
        "is_admin": is_admin,
        "created_at": now,
        "last_seen": now,
        "user_agent": (user_agent or "")[:200],
        "ip": ip or "",
        "ttl_seconds": ttl_seconds,
    }
    r = await get_redis()
    pipe = r.pipeline()
    pipe.setex(_session_key(sid), ttl_seconds, json.dumps(data))
    pipe.sadd(_user_sessions_key(user_id), sid)
    pipe.expire(_user_sessions_key(user_id), ttl_seconds + 86400)
    await pipe.execute()
    logger.info(f"session created for user_id={user_id} remember={remember}")
    return sid, ttl_seconds


async def get_session(sid: str) -> Optional[dict]:
    if not sid:
        return None
    r = await get_redis()
    raw = await r.get(_session_key(sid))
    if not raw:
        return None
    try:
        return json.loads(raw)
    except Exception:
        return None


async def touch_session(sid: str, *, min_gap_sec: int = 3600) -> None:
    r = await get_redis()
    raw = await r.get(_session_key(sid))
    if not raw:
        return
    try:
        data = json.loads(raw)
    except Exception:
        return
    ttl = int(data.get("ttl_seconds", SESSION_TTL_DAYS * 86400))
    now = datetime.now(timezone.utc)
    last = data.get("last_seen")
    if last:
        try:
            last_dt = datetime.fromisoformat(last)
            if (now - last_dt).total_seconds() < min_gap_sec:
                await r.expire(_session_key(sid), ttl)
                return
        except Exception:
            pass
    data["last_seen"] = now.isoformat()
    await r.setex(_session_key(sid), ttl, json.dumps(data))


async def delete_session(sid: str, user_id: int | None = None) -> None:
    r = await get_redis()
    pipe = r.pipeline()
    pipe.delete(_session_key(sid))
    if user_id is not None:
        pipe.srem(_user_sessions_key(user_id), sid)
    await pipe.execute()


async def list_user_sessions(user_id: int) -> list[dict]:
    r = await get_redis()
    sids = await r.smembers(_user_sessions_key(user_id))
    result = []
    for sid in sids:
        raw = await r.get(_session_key(sid))
        if not raw:
            await r.srem(_user_sessions_key(user_id), sid)
            continue
        try:
            data = json.loads(raw)
        except Exception:
            continue
        result.append({"session_id": sid, **data})
    result.sort(key=lambda x: x.get("last_seen", ""), reverse=True)
    return result


async def delete_all_user_sessions(user_id: int, *, except_sid: str | None = None) -> int:
    r = await get_redis()
    sids = await r.smembers(_user_sessions_key(user_id))
    count = 0
    for sid in sids:
        if except_sid and sid == except_sid:
            continue
        await r.delete(_session_key(sid))
        await r.srem(_user_sessions_key(user_id), sid)
        count += 1
    return count