import httpx
from .config import MEMORY_SERVICE_URL, AIWORKER_MEMORY_CLIENT_KEY

class MemoryClient:
    def __init__(self):
        self.client = httpx.AsyncClient(
            timeout=10.0, 
            base_url=MEMORY_SERVICE_URL,
            headers={"X-API-Key": AIWORKER_MEMORY_CLIENT_KEY}
        )
    
    async def add_ltm_fact(self, fact: str):
        resp = await self.client.post("/ltm", json={"fact": fact})
        resp.raise_for_status()
        return resp.json()
    
    async def delete_ltm_fact(self, fact_id: int):
        resp = await self.client.delete(f"/ltm/{fact_id}")
        resp.raise_for_status()
        return resp.json()
    
    async def close(self):
        await self.client.aclose()