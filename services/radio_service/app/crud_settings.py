import json
from .db import get_pool


DEFAULTS = {
    "announcements_enabled": True,
    "announcement_voices": ["dmitri", "irina"],
    "greeting_enabled": True,
    "greeting_interval_minutes": 30,
}


def _cast(key: str, raw: str):
    if key in ("announcements_enabled", "greeting_enabled"):
        return raw.lower() == "true"
    if key == "announcement_voices":
        try:
            return json.loads(raw)
        except Exception:
            return []
    if key == "greeting_interval_minutes":
        try:
            return int(raw)
        except Exception:
            return 30
    return raw


def _serialize(key: str, value) -> str:
    if key == "announcement_voices":
        return json.dumps(value)
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


async def get_settings() -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT key, value FROM radio_settings")
    result = dict(DEFAULTS)
    for r in rows:
        result[r["key"]] = _cast(r["key"], r["value"])
    return result


async def update_settings(patch: dict) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        for k, v in patch.items():
            if k not in DEFAULTS:
                continue
            await conn.execute(
                """
                INSERT INTO radio_settings (key, value) VALUES ($1, $2)
                ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
                """,
                k, _serialize(k, v)
            )
    return await get_settings()