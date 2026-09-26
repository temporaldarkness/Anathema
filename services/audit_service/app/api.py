from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from .auth import verify_api_key
from .crud import list_audit, get_stats, get_audit_entry

router = APIRouter()


@router.get("/audit")
async def list_audit_endpoint(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    actor_id: Optional[int] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    action: Optional[str] = None,
    success: Optional[bool] = None,
    source_service: Optional[str] = None,
    search: Optional[str] = None,
    caller: str = Depends(verify_api_key),
):
    return await list_audit(
        limit=limit,
        offset=offset,
        actor_id=actor_id,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        success=success,
        source_service=source_service,
        search=search,
    )

@router.get("/audit/stats/timeline")
async def audit_timeline(
    days: int = Query(7, ge=1, le=90),
    caller: str = Depends(verify_api_key),
):
    return {"days": days, "buckets": await get_timeline(days)}


@router.get("/audit/stats")
async def audit_stats_endpoint(caller: str = Depends(verify_api_key)):
    return await get_stats()


@router.get("/audit/{entry_id}")
async def audit_entry_endpoint(entry_id: int, caller: str = Depends(verify_api_key)):
    entry = await get_audit_entry(entry_id)
    if not entry:
        raise HTTPException(404, "Entry not found")
    return entry