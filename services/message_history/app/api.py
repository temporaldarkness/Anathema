from fastapi import APIRouter, HTTPException, Query
from .crud import get_history

router = APIRouter()

@router.get("/history/{channel_id}")
async def history(
    channel_id: int,
    limit: int = Query(50, ge=1, le=200),
):
    messages = await get_history(channel_id, limit)
    return {"channel_id": channel_id, "messages": messages}