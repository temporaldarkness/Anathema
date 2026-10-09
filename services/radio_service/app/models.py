from typing import Optional
from datetime import datetime
from pydantic import BaseModel


class SongOut(BaseModel):
    id: int
    storage_file_id: str
    title: str
    artist: str
    description: str
    duration_sec: Optional[float]
    size_bytes: Optional[int]
    uploaded_at: datetime
    uploaded_by: Optional[int]
    uploaded_by_username: Optional[str]
    play_count: int
    last_played_at: Optional[datetime]


class SongUpdate(BaseModel):
    title: str | None = None
    artist: str | None = None
    description: str | None = None
    announce_title: str | None = None


class NowPlaying(BaseModel):
    song_id: Optional[int]
    title: Optional[str]
    artist: Optional[str]
    started_at: Optional[str]
    ends_at: Optional[str]
    listeners: int