import httpx
import logging
from .config import MEMORY_SERVICE_URL, ADMIN_MEMORY_CLIENT_KEY

logger = logging.getLogger(__name__)

class MemoryClient:
    def __init__(self):
        self.client = httpx.AsyncClient(
            timeout=10.0, 
            base_url=MEMORY_SERVICE_URL, 
            headers={"X-API-Key": ADMIN_MEMORY_CLIENT_KEY}
        )
    
    async def get_setting(self, key: str):
        resp = await self.client.get(f"/settings/{key}")
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.json()
    
    async def update_setting(self, key: str, value: str):
        payload = {"key": key, "value": value}
        resp = await self.client.post("/settings", json=payload)
        resp.raise_for_status()
        return resp.json()
    
    async def get_channel(self, uid: str):
        resp = await self.client.get(f"/channels/{uid}")
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.json()
    
    async def upsert_channel(self, channel_data: dict):
        resp = await self.client.post("channels", json=channel_data)
        resp.raise_for_status()
        return resp.json()
    
    async def delete_channel(self, uid: str):
        resp = await self.client.delete(f"/channels/{uid}")
        resp.raise_for_status()
        return resp.json()
        
    async def close(self):
        await self.client.aclose()