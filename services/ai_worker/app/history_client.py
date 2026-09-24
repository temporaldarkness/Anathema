import httpx
import logging
from .config import MESSAGE_HISTORY_SERVICE_URL, AIWORKER_HISTORY_CLIENT_KEY

logger = logging.getLogger(__name__)

class HistoryClient:
    def __init__(self):
        self.client = httpx.AsyncClient(
            timeout=10.0, 
            base_url=MESSAGE_HISTORY_SERVICE_URL,
            headers={"X-API-Key": AIWORKER_HISTORY_CLIENT_KEY}
        )
    
    async def get_channel_history(self, channel_id: int, limit: int = 50):
        try:
            resp = await self.client.get(f"/history/{channel_id}", params={"limit": limit})
            if resp.status_code == 404:
                return []
            resp.raise_for_status()
            data = resp.json()
            return data.get("messages", [])
        except Exception as e:
            logger.warning(f"Failed to get history: {e}")
            return []
    
    async def close(self):
        await self.client.aclose()