import httpx
from .config import STORAGE_SERVICE_URL


class StorageClient:
    def __init__(self):
        self.base_url = STORAGE_SERVICE_URL
        self.client = httpx.AsyncClient(timeout=30.0)
    
    
    async def upload_file(self, data: bytes, content_type: str = "image/png") -> str:
        files = {"file": ("image.png", data, content_type)}
        resp = await self.client.post(f"{self.base_url}/upload", files=files)
        resp.raise_for_status()
        return resp.json()["file_id"]
    
    
    async def download_file(self, file_id: str) -> bytes:
        resp = await self.client.get(f"{self.base_url}/file/{file_id}")
        if resp.status_code == 404:
            raise FileNotFoundError(f"File {file_id} not found")
        resp.raise_for_status()
        return resp.content
    
    async def delete_file(self, file_id: str) -> bool:
        resp = await self.client.get(f"{self.base_url}/file/{file_id}")
        return resp.status_code == 200
    
    
    async def close(self):
        await self.client.aclose()