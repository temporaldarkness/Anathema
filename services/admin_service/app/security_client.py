import httpx
import logging
from .config import SECURITY_SERVICE_URL

logger = logging.getLogger(__name__)

class SecurityClient:
    def __init__(self):
        self.client = httpx.AsyncClient(timeout=5.0, base_url=SECURITY_SERVICE_URL)
    
    async def check_permission(self, guild_id: int, user_id: int, user_uid: str, permission: str) -> bool:
        resp = await self.client.post("/check", json={
            "guild_id": guild_id,
            "user_id": user_id,
            "user_uid": user_uid,
            "permission": permission
        })
        if resp.status_code != 200:
            return False
        data = resp.json()
        return data.get("allowed", False)
        
    async def close(self):
        await self.client.aclose()