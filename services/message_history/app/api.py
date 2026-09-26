from fastapi import APIRouter, HTTPException, Query, Depends
from .crud import get_history, get_top_channels, get_top_users, get_messages_timeline
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

@router.get("/stats/summary")
async def stats_summary(caller: str = Depends(verify_api_key)):
    return await get_messages_summary()


@router.get("/stats/timeline")
async def stats_timeline(
    hours: int = Query(24, ge=1, le=168),
    caller: str = Depends(verify_api_key),
):
    return {"hours": hours, "buckets": await get_messages_timeline(hours)}


@router.get("/stats/top-users")
async def stats_top_users(
    hours: int = Query(24, ge=1, le=168),
    limit: int = Query(10, ge=1, le=50),
    caller: str = Depends(verify_api_key),
):
    return {"hours": hours, "users": await get_top_users(hours, limit)}


@router.get("/stats/top-channels")
async def stats_top_channels(
    hours: int = Query(24, ge=1, le=168),
    limit: int = Query(10, ge=1, le=50),
    caller: str = Depends(verify_api_key),
):
    return {"hours": hours, "channels": await get_top_channels(hours, limit)}