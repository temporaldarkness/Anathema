import json
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import Response

from .storage import save_file, get_file, get_file_meta, list_files, delete_file
from .middleware import AuthAndLogMiddleware

logger = logging.getLogger(__name__)

app = FastAPI(title="Anathema Storage Service")
app.add_middleware(AuthAndLogMiddleware)

BOOT_TIME = datetime.now(timezone.utc)

@app.post("/upload")
async def upload_file_endpoint(
    file: UploadFile = File(...),
    metadata: Optional[str] = Form(None),
):
    content = await file.read()

    meta: dict = {}
    if metadata:
        try:
            parsed = json.loads(metadata)
            if isinstance(parsed, dict):
                meta = parsed
        except json.JSONDecodeError:
            logger.warning("upload: metadata is not valid JSON, ignoring")

    file_id = await save_file(
        content,
        content_type=file.content_type or "application/octet-stream",
        metadata=meta,
    )
    return {"file_id": file_id}

@app.get("/file/{file_id}")
async def get_file_endpoint(file_id: str):
    try:
        data, content_type = await get_file(file_id)
    except Exception:
        raise HTTPException(status_code=404, detail="File not found")
    return Response(content=data, media_type=content_type)


@app.get("/file/{file_id}/meta")
async def get_file_meta_endpoint(file_id: str):
    meta = await get_file_meta(file_id)
    if meta is None:
        raise HTTPException(status_code=404, detail="File not found")
    return meta

@app.get("/files")
async def list_files_endpoint(
    limit: int = Query(60, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    return await list_files(limit=limit, offset=offset)

@app.delete("/file/{file_id}")
async def delete_file_endpoint(file_id: str):
    deleted = await delete_file(file_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="File not found")
    return {"ok": True}

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "uptime_seconds": int((datetime.now(timezone.utc) - BOOT_TIME).total_seconds()),
    }