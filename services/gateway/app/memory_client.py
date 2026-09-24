import httpx
from .config import MEMORY_SERVICE_URL, GATEWAY_MEMORY_CLIENT_KEY

class MemoryClient:
    def __init__(self):
        self.client = httpx.AsyncClient(
            timeout=10.0, 
            base_url = MEMORY_SERVICE_URL,
            headers={"X-API-Key": GATEWAY_MEMORY_CLIENT_KEY}
        )
    
    async def get_ltm(self):
        resp = await self.client.get(f"/ltm")
        resp.raise_for_status()
        return resp.json()
    
    async def get_user_by_discord_id(self, user_id: int):
        resp = await self.client.get(f"/users/discord/{user_id}")
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.json()
    
    async def get_channel_by_discord_id(self, channel_id: int):
        resp = await self.client.get(f"/channels/discord/{channel_id}")
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.json()
    
    async def get_settings(self):
        resp = await self.client.get(f"/settings")
        resp.raise_for_status()
        settings_list = resp.json()
        return {item['key']: item['value'] for item in settings_list}
    
    async def close(self):
        await self.client.aclose()