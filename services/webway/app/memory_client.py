import os
import httpx
from typing import Optional
from .config import MEMORY_SERVICE_URL, WEBWAY_MEMORY_CLIENT_KEY

class MemoryClient:
    def __init__(self):
        self.client = httpx.AsyncClient(
            base_url=MEMORY_SERVICE_URL,
            headers={"X-API-Key": WEBWAY_MEMORY_CLIENT_KEY},
            timeout=10.0,
        )

    async def _get(self, path: str):
        resp = await self.client.get(path)
        resp.raise_for_status()
        return resp.json()

    async def list_ltm(self):          return await self._get("/ltm")
    async def list_users(self):        return await self._get("/users")
    async def list_channels(self):     return await self._get("/channels")
    async def list_emotes(self):       return await self._get("/emotes")
    async def list_keywords(self):     return await self._get("/keywords")
    async def list_user_reactions(self): return await self._get("/user_reactions")
    async def list_settings(self):     return await self._get("/settings")

    async def close(self):
        await self.client.aclose()