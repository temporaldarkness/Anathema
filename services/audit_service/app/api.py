from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from .crud import list_audit, get_stats, get_audit_entry, get_timeline
from .crud_usage import (
    get_usage_summary, get_usage_by_model, get_usage_by_source,
    get_usage_timeline, get_top_users_by_cost,
)

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
    search: Optional[str] = None
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
    days: int = Query(7, ge=1, le=90)
):
    return {"days": days, "buckets": await get_timeline(days)}


@router.get("/audit/stats")
async def audit_stats_endpoint():
    return await get_stats()


@router.get("/audit/{entry_id}")
async def audit_entry_endpoint(entry_id: int):
    entry = await get_audit_entry(entry_id)
    if not entry:
        raise HTTPException(404, "Entry not found")
    return entry

@router.get("/usage/summary")
async def usage_summary(
    days: int = Query(7, ge=1, le=90)
):
    return await get_usage_summary(days)


@router.get("/usage/by-model")
async def usage_by_model(
    days: int = Query(7, ge=1, le=90)
):
    return {"days": days, "items": await get_usage_by_model(days)}


@router.get("/usage/by-source")
async def usage_by_source(
    days: int = Query(7, ge=1, le=90)
):
    return {"days": days, "items": await get_usage_by_source(days)}


@router.get("/usage/timeline")
async def usage_timeline(
    days: int = Query(7, ge=1, le=90)
):
    return {"days": days, "buckets": await get_usage_timeline(days)}


@router.get("/usage/top-users")
async def usage_top_users(
    days: int = Query(7, ge=1, le=90),
    limit: int = Query(10, ge=1, le=50)
):
    return {"days": days, "users": await get_top_users_by_cost(days, limit)}