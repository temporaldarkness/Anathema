from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.responses import Response
from .storage import save_file, get_file, delete_file
import logging

logger = logging.getLogger(__name__)

app = FastAPI(title="Anathema Storage Service")

@app.post("/upload")
async def upload_file_endpoint(file: UploadFile = File(...)):
    content = await file.read()
    file_id = await save_file(content, file.content_type or "application/octet-stream")
    return {"file_id": file_id}

@app.get("/file/{file_id}")
async def get_file_endpoint(file_id: str):
    try:
        data, content_type = await get_file(file_id)
        return Response(content=data, media_type=content_type)
    except Exception:
        raise HTTPException(404, f"File not found: {e}")

@app.delete("/file/{file_id}")
async def delete_file_endpoint(file_id: str):
    try:
        await delete_file(file_id)
        return {"ok": True}
    except Exception:
        raise HTTPException(404, f"File not found or deletion failed: {e}")

