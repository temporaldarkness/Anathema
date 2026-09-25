import httpx
from .config import STORAGE_SERVICE_URL, GATEWAY_STORAGE_CLIENT_KEY
import json


class StorageClient:
    def __init__(self):
        self.client = httpx.AsyncClient(
            timeout=30.0, 
            base_url=STORAGE_SERVICE_URL, 
            headers={"X-API-Key": GATEWAY_STORAGE_CLIENT_KEY}
        )
    
    
    async def upload_file(self, data: bytes, content_type: str = "image/png", metadata: dict | None = None) -> str:
        files = {"file": ("image.png", data, content_type)}
        form = {}
        if metadata:
            form["metadata"] = json.dumps(metadata)
        resp = await self.client.post("/upload", files=files, data=form)
        resp.raise_for_status()
        return resp.json()["file_id"]
    
    
    async def download_file(self, file_id: str) -> bytes:
        resp = await self.client.get(f"/file/{file_id}")
        if resp.status_code == 404:
            raise FileNotFoundError(f"File {file_id} not found")
        resp.raise_for_status()
        return resp.content
    
    async def delete_file(self, file_id: str) -> bool:
        resp = await self.client.get(f"/file/{file_id}")
        return resp.status_code == 200
    
    
    async def close(self):
        await self.client.aclose()