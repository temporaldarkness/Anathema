from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

class Message(BaseModel):
    message_id: str
    channel_id: int
    user_id: int
    username: str
    content: str
    timestamp: datetime
    reply_to_message_id: Optional[str] = None
    attachments: List[dict] = []

class MessageInDB(Message):
    id: int