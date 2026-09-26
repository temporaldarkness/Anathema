from typing import Any, Optional
from datetime import datetime
from pydantic import BaseModel, Field


class AuditEvent(BaseModel):
    event_id: str = Field(..., description="UUID события, для идемпотентности")
    timestamp: Optional[str] = Field(None, description="ISO-8601 момент действия")
    source_service: str = Field(..., description="webway / gateway / admin_service / ...")
    actor_id: Optional[int] = None
    actor_username: Optional[str] = None
    actor_type: str = "system"
    action: str
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None
    details: dict[str, Any] = {}
    success: bool = True
    error: Optional[str] = None
    ip: Optional[str] = None


class AuditEntryOut(BaseModel):
    id: int
    event_id: str
    created_at: datetime
    received_at: datetime
    source_service: str
    actor_id: Optional[int]
    actor_username: Optional[str]
    actor_type: Optional[str]
    action: str
    entity_type: Optional[str]
    entity_id: Optional[str]
    details: dict[str, Any]
    success: bool
    error: Optional[str]
    ip: Optional[str]