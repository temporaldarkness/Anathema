from .db import get_pool


async def get_user_trivia(uid: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, kind, content, created_at FROM user_trivia "
            "WHERE user_uid = $1 ORDER BY kind, id",
            uid,
        )
    return [
        {
            "id": r["id"],
            "kind": r["kind"],
            "content": r["content"],
            "created_at": r["created_at"].isoformat(),
        }
        for r in rows
    ]


async def add_trivia(uid: str, kind: str, content: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        exists = await conn.fetchval("SELECT 1 FROM users WHERE uid = $1", uid)
        if not exists:
            return None
        row = await conn.fetchrow(
            "INSERT INTO user_trivia (user_uid, kind, content) "
            "VALUES ($1, $2, $3) RETURNING id, kind, content, created_at",
            uid, kind, content,
        )
    return {
        "id": row["id"],
        "kind": row["kind"],
        "content": row["content"],
        "created_at": row["created_at"].isoformat(),
    }


async def update_trivia(item_id: int, content: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "UPDATE user_trivia SET content = $1 WHERE id = $2 "
            "RETURNING id, kind, content, created_at",
            content, item_id,
        )
    if not row:
        return None
    return {
        "id": row["id"],
        "kind": row["kind"],
        "content": row["content"],
        "created_at": row["created_at"].isoformat(),
    }


async def delete_trivia(item_id: int) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute("DELETE FROM user_trivia WHERE id = $1", item_id)
    return result == "DELETE 1"