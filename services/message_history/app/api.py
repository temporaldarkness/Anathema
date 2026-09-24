from fastapi import APIRouter, HTTPException, Query, Depends
from .crud import get_history
from .auth import verify_api_key

router = APIRouter()

@router.get("/history/{channel_id}")
async def history(
    channel_id: int,
    limit: int = Query(50, ge=1, le=200),
    caller: str = Depends(verify_api_key)
):
    messages = await get_history(channel_id, limit)
    return {"channel_id": channel_id, "messages": messages}