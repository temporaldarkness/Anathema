import os
import httpx
import logging
from .config import RADIO_SERVICE_URL, WEBWAY_RADIO_CLIENT_KEY

logger = logging.getLogger(__name__)


class RadioClient:
    def __init__(self):
        self.client = httpx.AsyncClient(
            base_url=RADIO_SERVICE_URL,
            headers={"X-API-Key": WEBWAY_RADIO_CLIENT_KEY},
            timeout=60.0,
        )

    async def list_songs(self, limit=200, offset=0, search=None):
        params = {"limit": limit, "offset": offset}
        if search:
            params["search"] = search
        resp = await self.client.get("/songs", params=params)
        resp.raise_for_status()
        return resp.json()

    async def get_song(self, song_id: int):
        resp = await self.client.get(f"/songs/{song_id}")
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.json()

    async def upload_song(self, file_bytes: bytes, filename: str, fields: dict):
        files = {"file": (filename, file_bytes, "audio/mpeg")}
        data = {k: str(v) for k, v in fields.items() if v is not None}
        resp = await self.client.post("/songs", files=files, data=data)
        resp.raise_for_status()
        return resp.json()

    async def update_song(self, song_id: int, fields: dict):
        resp = await self.client.patch(f"/songs/{song_id}", json=fields)
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.json()

    async def delete_song(self, song_id: int):
        resp = await self.client.delete(f"/songs/{song_id}")
        if resp.status_code == 404:
            return False
        resp.raise_for_status()
        return True

    async def now_playing(self):
        resp = await self.client.get("/now")
        resp.raise_for_status()
        return resp.json()

    async def skip(self, by: int, by_username: str):
        resp = await self.client.post(
            "/skip",
            data={"by": str(by), "by_username": by_username},
        )
        resp.raise_for_status()
        return resp.json()

    async def history(self, limit=50, offset=0):
        resp = await self.client.get(
            "/history", params={"limit": limit, "offset": offset}
        )
        resp.raise_for_status()
        return resp.json()
    
    async def queue_list(self):
        resp = await self.client.get("/queue")
        resp.raise_for_status()
        return resp.json()

    async def queue_add(self, song_id: int):
        resp = await self.client.post(f"/queue/{song_id}")
        if resp.status_code == 404:
            return False
        resp.raise_for_status()
        return True

    async def queue_remove(self, song_id: int):
        resp = await self.client.delete(f"/queue/{song_id}")
        if resp.status_code == 404:
            return False
        resp.raise_for_status()
        return True

    async def queue_clear(self):
        resp = await self.client.delete("/queue")
        resp.raise_for_status()
        return resp.json()
    
    async def queue_remove_next(self):
        resp = await self.client.delete("/queue/next")
        if resp.status_code == 404:
            return False
        resp.raise_for_status()
        return True


radio = RadioClient()