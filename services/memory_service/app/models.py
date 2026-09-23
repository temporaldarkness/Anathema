from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

class LTMItem(BaseModel):
    id: int
    fact: str
    created_at: datetime

class LTMItemCreate(BaseModel):
    fact: str

class UserBase(BaseModel):
    uid: str
    username: str
    user_id: int
    aliases: List[str] = []
    gender: Optional[int] = None
    orientation: Optional[int] = None

class UserCreate(UserBase):
    pass

class ChannelBase(BaseModel):
    uid: str
    channel_id: int
    human_name: Optional[str] = None
    human_topic: Optional[str] = None
    prompt: Optional[str] = None

class EmoteBase(BaseModel):
    uid: str
    source: str
    human_code: Optional[str] = None
    description: Optional[str] = None

class KeywordReactionCreate(BaseModel):
    keyword: str
    emoji_uid: str

class KeywordReaction(KeywordReactionCreate):
    id: int

class UserReactionCreate(BaseModel):
    user_uid: str
    emoji_uid: str

class UserReaction(KeywordReactionCreate):
    id: int

class Setting(BaseModel):
    key:str
    value:str
