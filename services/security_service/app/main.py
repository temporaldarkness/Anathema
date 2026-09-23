from fastapi import FastAPI
from pydantic import BaseModel
from .security import check_permission, close

app = FastAPI(title="Anathema Security Service")

class PermissionRequest(BaseModel):
    guild_id: int
    user_id: int
    user_uid: str
    permission: str


@app.post("/check")
async def check(req: PermissionRequest):
    if req.permission not in ("admin", "superuser"):
        raise HTTPException(status_code=400, detail="Invalid permission type")
    allowed = await check_permission(req.guild_id, req.user_id, req.user_uid, req.permission)
    return {"allowed": allowed}


@app.on_event("shutdown")
async def shutdown():
    await close()


@app.get("/health")
async def health():
    return {"status": "ok"}