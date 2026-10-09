from datetime import datetime, timedelta, timezone
from typing import Optional, List, Union

import httpx
from fastapi import FastAPI, HTTPException, Depends, Request, Response, Query, UploadFile, File, Form, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field, field_validator
import asyncio
from .memory_client import MemoryClient
import time
import redis.asyncio as redis
import uuid
from .audit_transport import audit_transport
from contextlib import asynccontextmanager
from .discord_client import DiscordClient
from .radio_client import radio
import json
from . import session as session_store
import secrets

from .config import DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_REDIRECT_URI, DISCORD_GUILD_ID, WEBWAY_MEMORY_CLIENT_KEY, WEBWAY_SECURITY_CLIENT_KEY, WEBWAY_HISTORY_CLIENT_KEY, WEBWAY_STORAGE_CLIENT_KEY, WEBWAY_AUDIT_CLIENT_KEY, MEMORY_SERVICE_URL, MESSAGE_HISTORY_SERVICE_URL, SECURITY_SERVICE_URL, STORAGE_SERVICE_URL, DISCORD_TOKEN, PROXY_API_BALANCE_URL, PROXY_API_KEY, REDIS_URL, AUDIT_SERVICE_URL, KAFKA_BOOTSTRAP_SERVERS, DISCORD_GUILD_ID, RADIO_SERVICE_URL, WEBWAY_RADIO_CLIENT_KEY, BACKEND_URL, SESSION_COOKIE_NAME, SESSION_COOKIE_SECURE, WEBWAY_TTS_CLIENT_KEY, TTS_SERVICE_URL

CHANNEL_TYPES = {
    0: "Текстовый",
    2: "Голосовой",
    4: "Категория",
    5: "Анонсы",
    13: "Стрим",
    15: "Форум",
    16: "Медиа",
}
TEXT_CHANNEL_TYPES = {0, 5, 15, 16}
CATEGORY_TYPE = 4

EXPECTED_WORKERS = {
    "gateway":          {"label": "Gateway"},
    "ai_worker":        {"label": "AI Worker"},
    "image_worker":     {"label": "Image Worker"},
    "reaction_worker":  {"label": "Reaction Worker"},
    "admin_service":    {"label": "Admin Service"},
    "tts_service":      {"label": "TTS Service"}
}
STALE_AFTER_SEC = 50

discord_client = DiscordClient()

BOOT_TIME = datetime.now(timezone.utc)

@asynccontextmanager
async def lifespan(app: FastAPI):
    await audit_transport.start()
    yield
    await radio.client.aclose()
    await discord_client.close()
    await audit_transport.stop()
    await memory.close()

app = FastAPI(title="Anathema Webway Backend Service", lifespan=lifespan)

class UserSession(BaseModel):
    user_id: str
    username: str
    avatar_url: str | None = None
    is_admin: bool
    expires_at: int | None = None
    created_at: str | None = None
    
    @field_validator("user_id", mode="before")
    @classmethod
    def coerce_user_id(cls, v):
        return str(v) if v is not None else v

class BatchUsersPayload(BaseModel):
    ids: list[int]

class LTMItem(BaseModel):
    fact: str

class LTMUpdatePayload(BaseModel):
    fact: str = Field(..., min_length=1, max_length=2000)

class ChannelPayload(BaseModel):
    uid: str = Field(..., min_length=1, max_length=64)
    channel_id: str
    human_name: Optional[str] = None
    human_topic: Optional[str] = None
    prompt: Optional[str] = None

    @field_validator("channel_id", mode="before")
    @classmethod
    def coerce_channel_id(cls, v):
        return str(v) if v is not None else v

class KeywordPayload(BaseModel):
    keyword: str = Field(..., min_length=1, max_length=128)
    emoji_uid: str = Field(..., min_length=1, max_length=64)


class UserReactionPayload(BaseModel):
    user_uid: str = Field(..., min_length=1, max_length=64)
    emoji_uid: str = Field(..., min_length=1, max_length=64)


class EmotePayload(BaseModel):
    uid: str = Field(..., min_length=1, max_length=64)
    source: str = Field(..., min_length=1, max_length=64)
    human_code: Optional[str] = None
    description: Optional[str] = None

class SettingPayload(BaseModel):
    key: str = Field(..., min_length=1, max_length=64)
    value: str
    
    @field_validator("value", mode="before")
    @classmethod
    def coerce_to_str(cls, v):
        if isinstance(v, bool):
            return "true" if v else "false"
        return str(v)

_redis = None
async def get_redis():
    global _redis
    if _redis is None:
        _redis = await redis.from_url(REDIS_URL, decode_responses=True)
    return _redis

class VoiceCommand(BaseModel):
    cmd: str   # join | leave | volume
    channel_id: str | None = None
    value: float | None = None

async def get_kafka_metrics(bootstrap: str) -> dict:
    return {"ok": None, "topics": [], "error": "disabled"}

async def write_audit(
    request: Request,
    current_user: UserSession,
    action: str,
    entity_type: str | None = None,
    entity_id: str | None = None,
    details: dict | None = None,
    success: bool = True,
    error: str | None = None,
):
    event = {
        "event_id": str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "source_service": "webway",
        "actor_id": current_user.user_id,
        "actor_username": current_user.username,
        "actor_type": "webway",
        "action": action,
        "entity_type": entity_type,
        "entity_id": str(entity_id) if entity_id is not None else None,
        "details": details or {},
        "success": success,
        "error": error,
        "ip": request.client.host if request.client else None,
    }
    await audit_transport.send(event)

async def get_bot_uptime() -> dict:
    try:
        r = await get_redis()
        raw = await r.get("bot:boot_time")
        if not raw:
            return {"ok": False, "uptime_seconds": None, "boot_time": None}
        boot = datetime.fromisoformat(raw)
        now = datetime.now(timezone.utc)
        return {
            "ok": True,
            "uptime_seconds": int((now - boot).total_seconds()),
            "boot_time": raw,
        }
    except Exception as e:
        return {"ok": False, "uptime_seconds": None, "boot_time": None, "error": str(e)}

async def get_current_user(request: Request) -> UserSession:
    sid = request.cookies.get(SESSION_COOKIE_NAME)
    if not sid:
        raise HTTPException(status_code=401, detail="Not authenticated")
    data = await session_store.get_session(sid)
    if not data:
        raise HTTPException(status_code=401, detail="Session expired")
    await session_store.touch_session(sid)
    try:
        last_seen = datetime.fromisoformat(data["last_seen"])
        ttl = int(data.get("ttl_seconds", 0))
        expires_dt = last_seen + timedelta(seconds=ttl)
        expires_at = int(expires_dt.timestamp())
    except Exception:
        expires_at = None
    return UserSession(
        user_id=int(data["user_id"]),
        username=data["username"],
        avatar_url=data["avatar_url"],
        is_admin=bool(data["is_admin"]),
        expires_at=expires_at,
        created_at=data.get("created_at")
    )

memory = MemoryClient()

@app.get("/api/dashboard/stats")
async def dashboard_stats(current_user: UserSession = Depends(get_current_user)):
    results = await asyncio.gather(
        memory.list_ltm(),
        memory.list_users(),
        memory.list_channels(),
        memory.list_emotes(),
        memory.list_keywords(),
        memory.list_user_reactions(),
        return_exceptions=True,
    )
    ltm, users, channels, emotes, keywords, user_reactions = results

    def count(x): return len(x) if isinstance(x, list) else 0

    return {
        "ltm": count(ltm),
        "users": count(users),
        "channels": count(channels),
        "emotes": count(emotes),
        "keywords": count(keywords),
        "user_reactions": count(user_reactions),
    }


@app.get("/auth/discord/login")
async def discord_login(remember: bool = True):
    
    state = secrets.token_urlsafe(24)
    r = await session_store.get_redis()
    await r.setex(f"oauth_state:{state}", 300, "1" if remember else "0")
    
    params = {
        "client_id": DISCORD_CLIENT_ID,
        "redirect_uri": DISCORD_REDIRECT_URI,
        "response_type": "code",
        "scope": "identify guilds",
        "state": state,
    }
    query_string = "&".join(f"{k}={v}" for k, v in params.items())
    return RedirectResponse(f"https://discord.com/api/oauth2/authorize?{query_string}")

def build_avatar_url(user: dict) -> str | None:
    if not user.get("avatar"):
        return None
    ext = "gif" if user["avatar"].startswith("a_") else "png"
    return f"https://cdn.discordapp.com/avatars/{user['id']}/{user['avatar']}.{ext}"

@app.get("/auth/discord/callback")
async def discord_callback(code: str, state: str, request: Request):
    
    r = await session_store.get_redis()
    remember_raw = await r.get(f"oauth_state:{state}")
    if remember_raw is None:
        raise HTTPException(status_code=400, detail="Invalid or expired state")
    await r.delete(f"oauth_state:{state}")
    remember = remember_raw == "1"
    
    data = {
        "client_id": DISCORD_CLIENT_ID,
        "client_secret": DISCORD_CLIENT_SECRET,
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": DISCORD_REDIRECT_URI,
    }
    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    async with httpx.AsyncClient() as client:
        resp = await client.post("https://discord.com/api/v10/oauth2/token", data=data, headers=headers)
        resp.raise_for_status()
        token_data = resp.json()
        access_token = token_data["access_token"]

    async with httpx.AsyncClient() as client:
        auth_headers = {"Authorization": f"Bearer {access_token}"}
        user_resp = await client.get("https://discord.com/api/v10/users/@me", headers=auth_headers)
        user_resp.raise_for_status()
        user = user_resp.json()
        avatar_url = build_avatar_url(user)

        guilds_resp = await client.get("https://discord.com/api/v10/users/@me/guilds", headers=auth_headers)
        guilds_resp.raise_for_status()
        guilds = guilds_resp.json()

    is_admin = False
    for guild in guilds:
        if int(guild["id"]) == DISCORD_GUILD_ID:
            permissions = int(guild.get("permissions", 0))
            if (permissions & 0x8) or (permissions & 0x20):
                is_admin = True
            break
    
    if not is_admin:
        raise HTTPException(status_code=403, detail="You do not have permission to access this panel.")

    user_agent = request.headers.get("user-agent")
    ip = request.client.host if request.client else None
    sid, ttl = await session_store.create_session(
        user_id=int(user["id"]),
        username=user["username"],
        avatar_url=avatar_url,
        is_admin=is_admin,
        remember=remember,
        user_agent=user_agent,
        ip=ip,
    )

    response = RedirectResponse(url="/dashboard")
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=sid,
        httponly=True,
        secure=SESSION_COOKIE_SECURE,
        samesite="lax",
        max_age=ttl,
        path="/",
    )
    return response

@app.post("/auth/logout")
async def logout(request: Request):
    sid = request.cookies.get(SESSION_COOKIE_NAME)
    if sid:
        data = await session_store.get_session(sid)
        user_id = int(data["user_id"]) if data else None
        await session_store.delete_session(sid, user_id=user_id)
    response = JSONResponse({"ok": True})
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")
    return response

@app.get("/api/sessions")
async def list_sessions(
    request: Request,
    current_user: UserSession = Depends(get_current_user),
):
    sessions = await session_store.list_user_sessions(current_user.user_id)
    current_sid = request.cookies.get(SESSION_COOKIE_NAME)
    for s in sessions:
        s["is_current"] = (s["session_id"] == current_sid)
    return {"sessions": sessions}


@app.delete("/api/sessions/{sid}")
async def revoke_session(
    sid: str,
    current_user: UserSession = Depends(get_current_user),
):
    target = await session_store.get_session(sid)
    if not target or int(target.get("user_id", -1)) != current_user.user_id:
        raise HTTPException(404, "Session not found")
    await session_store.delete_session(sid, user_id=current_user.user_id)
    return {"ok": True}


@app.post("/api/sessions/revoke-all")
async def revoke_all_sessions(
    request: Request,
    current_user: UserSession = Depends(get_current_user),
):
    current_sid = request.cookies.get(SESSION_COOKIE_NAME)
    n = await session_store.delete_all_user_sessions(
        current_user.user_id, except_sid=current_sid
    )
    return {"ok": True, "revoked": n}

@app.get("/api/me")
async def read_users_me(current_user: UserSession = Depends(get_current_user)):
    return current_user

@app.get("/api/settings")
async def get_settings(current_user: UserSession = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin privileges required")
    
    memory_url = MEMORY_SERVICE_URL
    api_key = WEBWAY_MEMORY_CLIENT_KEY
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{memory_url}/settings", headers={"X-API-Key": api_key})
        resp.raise_for_status()
        return resp.json()

@app.get("/api/ltm")
async def list_ltm(current_user: UserSession = Depends(get_current_user)):
    return await memory.list_ltm()

@app.post("/api/ltm")
async def create_ltm(
    item: LTMItem,
    request: Request,
    current_user: UserSession = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{MEMORY_SERVICE_URL}/ltm",
                json={"fact": item.fact},
                headers={"X-API-Key": WEBWAY_MEMORY_CLIENT_KEY},
            )
            resp.raise_for_status()
            result = resp.json()

        await write_audit(
            request, current_user,
            action="create", entity_type="ltm", entity_id=result.get("id"),
            details={"fact": item.fact[:200]},
        )
        return result
    except Exception as e:
        await write_audit(
            request, current_user,
            action="create", entity_type="ltm",
            success=False, error=str(e),
        )
        raise

@app.delete("/api/ltm/{fact_id}")
async def delete_ltm(
    fact_id: int,
    request: Request,
    current_user: UserSession = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.delete(
                f"{MEMORY_SERVICE_URL}/ltm/{fact_id}",
                headers={"X-API-Key": WEBWAY_MEMORY_CLIENT_KEY},
            )
            if resp.status_code == 404:
                raise HTTPException(404, "Not found")
            resp.raise_for_status()

        await write_audit(
            request, current_user,
            action="delete", entity_type="ltm", entity_id=fact_id,
        )
        return {"ok": True}
    except Exception as e:
        await write_audit(
            request, current_user,
            action="delete", entity_type="ltm", entity_id=fact_id,
            success=False, error=str(e),
        )
        raise

@app.put("/api/ltm/{fact_id}")
async def update_ltm_api(
    fact_id: int,
    payload: LTMUpdatePayload,
    request: Request,
    current_user: UserSession = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.put(
                f"{MEMORY_SERVICE_URL}/ltm/{fact_id}",
                json=payload.model_dump(),
                headers={"X-API-Key": WEBWAY_MEMORY_CLIENT_KEY},
            )
            if resp.status_code == 404:
                raise HTTPException(404, "Fact not found")
            resp.raise_for_status()
            result = resp.json()
        await write_audit(
            request, current_user,
            action="update", entity_type="ltm", entity_id=str(fact_id),
            details={"preview": payload.fact[:100]},
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        await write_audit(
            request, current_user, action="update",
            entity_type="ltm", entity_id=str(fact_id),
            success=False, error=str(e),
        )
        raise

class UserPayload(BaseModel):
    uid: str = Field(..., min_length=1, max_length=64)
    username: str = Field(..., min_length=1, max_length=100)
    user_id: int
    aliases: List[str] = []
    gender: Optional[int] = None
    orientation: Optional[int] = None
    allowed: bool = False

    @field_validator("user_id", mode="before")
    @classmethod
    def coerce_user_id(cls, v):
        return str(v) if v is not None else v

@app.get("/api/users")
async def list_users_api(current_user: UserSession = Depends(get_current_user)):
    return await memory.list_users()

@app.post("/api/users")
async def create_or_update_user(
    payload: UserPayload,
    request: Request,
    current_user: UserSession = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")
    try:
        aliases = payload.aliases or []
        if not aliases:
            aliases = [f"<@{payload.user_id}>", payload.username]
        
        body = payload.model_dump()
        body["aliases"] = aliases

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{MEMORY_SERVICE_URL}/users",
                json=body,
                headers={"X-API-Key": WEBWAY_MEMORY_CLIENT_KEY},
            )
        
        if resp.status_code == 409:
            raise HTTPException(409, detail=resp.json().get("detail"))
        if not resp.is_success:
            raise HTTPException(resp.status_code, detail=resp.text)
        
        await write_audit(
            request, current_user,
            action="upsert", entity_type="user", entity_id=payload.uid,
            details={"username": payload.username, "user_id": payload.user_id, "allowed": payload.allowed},
        )
        return resp.json()
    except Exception as e:
        await write_audit(
            request, current_user,
            action="upsert", entity_type="user",
            success=False, error=str(e),
        )
        raise

@app.delete("/api/users/{uid}")
async def delete_user_api(
    uid: str,
    request: Request,
    current_user: UserSession = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.delete(
                f"{MEMORY_SERVICE_URL}/users/{uid}",
                headers={"X-API-Key": WEBWAY_MEMORY_CLIENT_KEY},
            )
            if resp.status_code == 404:
                raise HTTPException(404, "User not found")
            resp.raise_for_status()
            await write_audit(
                request, current_user,
                action="delete", entity_type="user", entity_id=uid,
            )
            return {"ok": True}
    except Exception as e:
        await write_audit(
            request, current_user,
            action="delete", entity_type="user",
            success=False, error=str(e),
        )
        raise

@app.get("/api/discord/user/{user_id}")
async def fetch_discord_user(
    user_id: int,
    current_user: UserSession = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")
    try:
        if not DISCORD_TOKEN:
            raise HTTPException(500, "Discord token not configured")

        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"https://discord.com/api/v10/users/{user_id}",
                headers={"Authorization": f"Bot {DISCORD_TOKEN}"},
            )
            if resp.status_code == 404:
                raise HTTPException(404, "Discord user not found")
            resp.raise_for_status()
            data = resp.json()
            
        return {
            "id": str(data["id"]),
            "username": data["username"],
            "global_name": data.get("global_name"),
            "display_name": data.get("global_name") or data["username"],
            "avatar_url": build_avatar_url(data),
        }
    except Exception as e:
        raise

@app.get("/api/channels")
async def list_channels_api(current_user: UserSession = Depends(get_current_user)):
    return await memory.list_channels()

@app.post("/api/channels")
async def upsert_channel_api(
    payload: ChannelPayload,
    request: Request,
    current_user: UserSession = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{MEMORY_SERVICE_URL}/channels",
                json=payload.model_dump(),
                headers={"X-API-Key": WEBWAY_MEMORY_CLIENT_KEY},
            )
            resp.raise_for_status()
            await write_audit(
                request, current_user,
                action="upsert", entity_type="channel", entity_id=payload.uid,
                details={"channel_id": payload.channel_id, "human_name": payload.human_name},
            )
            return resp.json()
    except Exception as e:
        await write_audit(
            request, current_user,
            action="upsert", entity_type="channel",
            success=False, error=str(e),
        )
        raise

@app.delete("/api/channels/{uid}")
async def delete_channel_api(
    uid: str,
    request: Request,
    current_user: UserSession = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.delete(
                f"{MEMORY_SERVICE_URL}/channels/{uid}",
                headers={"X-API-Key": WEBWAY_MEMORY_CLIENT_KEY},
            )
            if resp.status_code == 404:
                raise HTTPException(404, "Channel not found")
            resp.raise_for_status()
            await write_audit(
                request, current_user,
                action="delete", entity_type="channel", entity_id=uid,
            )
            return {"ok": True}
    except Exception as e:
        await write_audit(
            request, current_user,
            action="delete", entity_type="channel",
            success=False, error=str(e),
        )
        raise

@app.get("/api/discord/channel/{channel_id}")
async def fetch_discord_channel(
    channel_id: int,
    current_user: UserSession = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")

    if not DISCORD_TOKEN:
        raise HTTPException(500, "Discord token not configured")

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"https://discord.com/api/v10/channels/{channel_id}",
            headers={"Authorization": f"Bot {DISCORD_TOKEN}"},
        )
        if resp.status_code == 404:
            raise HTTPException(404, "Channel not found")
        resp.raise_for_status()
        data = resp.json()

    return {
        "id": str(data["id"]),
        "name": data.get("name"),
        "topic": data.get("topic"),
        "type": data.get("type"),
        "guild_id": str(data["guild_id"]) if data.get("guild_id") else None,
        "parent_id": str(data["parent_id"]) if data.get("parent_id") else None,
    }

@app.get("/api/emotes")
async def list_emotes_api(current_user: UserSession = Depends(get_current_user)):
    return await memory.list_emotes()


@app.post("/api/emotes")
async def upsert_emote_api(
    payload: EmotePayload,
    request: Request,
    current_user: UserSession = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{MEMORY_SERVICE_URL}/emotes",
                json=payload.model_dump(),
                headers={"X-API-Key": WEBWAY_MEMORY_CLIENT_KEY},
            )
            resp.raise_for_status()
            await write_audit(
                request, current_user,
                action="upsert", entity_type="emote", entity_id=payload.uid,
                details={"source": payload.source, "human_code": payload.human_code},
            )
            return resp.json()
    except Exception as e:
        await write_audit(
            request, current_user,
            action="upsert", entity_type="emote",
            success=False, error=str(e),
        )
        raise


@app.delete("/api/emotes/{uid}")
async def delete_emote_api(
    uid: str,
    request: Request,
    current_user: UserSession = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.delete(
                f"{MEMORY_SERVICE_URL}/emotes/{uid}",
                headers={"X-API-Key": WEBWAY_MEMORY_CLIENT_KEY},
            )
            if resp.status_code == 404:
                raise HTTPException(404, "Emote not found")
            resp.raise_for_status()
            await write_audit(
                request, current_user,
                action="delete", entity_type="emote", entity_id=uid,
            )
            return {"ok": True}
    except Exception as e:
        await write_audit(
            request, current_user,
            action="delete", entity_type="emote",
            success=False, error=str(e),
        )
        raise

@app.get("/api/emotes/{uid}/usage")
async def emote_usage(
    uid: str,
    current_user: UserSession = Depends(get_current_user),
):
    async with httpx.AsyncClient() as client:
        kw_resp = await client.get(
            f"{MEMORY_SERVICE_URL}/keywords",
            headers={"X-API-Key": WEBWAY_MEMORY_CLIENT_KEY},
        )
        ur_resp = await client.get(
            f"{MEMORY_SERVICE_URL}/user_reactions",
            headers={"X-API-Key": WEBWAY_MEMORY_CLIENT_KEY},
        )
        kw_resp.raise_for_status()
        ur_resp.raise_for_status()

    keywords = [k for k in kw_resp.json() if k.get("emoji_uid") == uid]
    user_rx = [u for u in ur_resp.json() if u.get("emoji_uid") == uid]
    return {"keywords": keywords, "user_reactions": user_rx}

@app.get("/api/keywords")
async def list_keywords_api(current_user: UserSession = Depends(get_current_user)):
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{MEMORY_SERVICE_URL}/keywords",
            headers={"X-API-Key": WEBWAY_MEMORY_CLIENT_KEY},
        )
        resp.raise_for_status()
        return resp.json()


@app.post("/api/keywords")
async def add_keyword_api(
    payload: KeywordPayload,
    request: Request,
    current_user: UserSession = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{MEMORY_SERVICE_URL}/keywords",
                json={"keyword": payload.keyword, "emoji_uid": payload.emoji_uid},
                headers={"X-API-Key": WEBWAY_MEMORY_CLIENT_KEY},
            )
            resp.raise_for_status()
            result = resp.json()

            await write_audit(
                request, current_user,
                action="create", entity_type="keyword", entity_id=result.get("id"),
                details={"keyword": payload.keyword, "emoji_uid": payload.emoji_uid},
            )
            return result
    except Exception as e:
        await write_audit(
            request, current_user,
            action="create", entity_type="keyword",
            success=False, error=str(e),
        )
        raise


@app.delete("/api/keywords/{keyword_id}")
async def delete_keyword_api(
    keyword_id: str,
    request: Request,
    current_user: UserSession = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.delete(
                f"{MEMORY_SERVICE_URL}/keywords/{keyword_id}",
                headers={"X-API-Key": WEBWAY_MEMORY_CLIENT_KEY},
            )
            if resp.status_code == 404:
                raise HTTPException(404, "Keyword not found")
            resp.raise_for_status()
            await write_audit(
                request, current_user,
                action="delete", entity_type="keyword", entity_id=keyword_id,
            )
            return {"ok": True}
    except Exception as e:
        await write_audit(
            request, current_user,
            action="delete", entity_type="keyword",
            success=False, error=str(e),
        )
        raise


@app.get("/api/user_reactions")
async def list_user_reactions_api(current_user: UserSession = Depends(get_current_user)):
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{MEMORY_SERVICE_URL}/user_reactions",
            headers={"X-API-Key": WEBWAY_MEMORY_CLIENT_KEY},
        )
        resp.raise_for_status()
        return resp.json()

@app.post("/api/user_reactions")
async def add_user_reaction_api(
    payload: UserReactionPayload,
    request: Request,
    current_user: UserSession = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{MEMORY_SERVICE_URL}/user_reactions",
                json={"user_uid": payload.user_uid, "emoji_uid": payload.emoji_uid},
                headers={"X-API-Key": WEBWAY_MEMORY_CLIENT_KEY},
            )
            resp.raise_for_status()
            result = resp.json()
            await write_audit(
                request, current_user,
                action="create", entity_type="user_reaction", entity_id=result.get("id"),
                details={"user_uid": payload.user_uid, "emoji_uid": payload.emoji_uid},
            )
            return result
    except Exception as e:
        await write_audit(
            request, current_user,
            action="create", entity_type="user_reaction",
            success=False, error=str(e),
        )
        raise


@app.delete("/api/user_reactions/{reaction_id}")
async def delete_user_reaction_api(
    reaction_id: str,
    request: Request,
    current_user: UserSession = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.delete(
                f"{MEMORY_SERVICE_URL}/user_reactions/{reaction_id}",
                headers={"X-API-Key": WEBWAY_MEMORY_CLIENT_KEY},
            )
            if resp.status_code == 404:
                raise HTTPException(404, "Reaction not found")
            resp.raise_for_status()
            await write_audit(
                request, current_user,
                action="delete", entity_type="user_reaction", entity_id=reaction_id,
            )
            return {"ok": True}
    except Exception as e:
        await write_audit(
            request, current_user,
            action="delete", entity_type="user_reaction",
            success=False, error=str(e),
        )
        raise

async def ping_service(client: httpx.AsyncClient, url: str, headers: dict | None = None):
    start = time.perf_counter()
    try:
        resp = await client.get(f"{url}/health", headers=headers or {}, timeout=3.0)
        latency = (time.perf_counter() - start) * 1000
        uptime = None
        try:
            body = resp.json()
            uptime = body.get("uptime_seconds")
        except Exception:
            pass
        return {
            "ok": resp.status_code < 500,
            "latency_ms": round(latency, 1),
            "status": resp.status_code,
            "uptime_seconds": uptime,
        }
    except Exception as e:
        return {
            "ok": False,
            "latency_ms": None,
            "status": None,
            "uptime_seconds": None,
            "error": str(e),
        }

async def get_proxy_balance() -> dict:
    if not PROXY_API_KEY:
        return {"ok": False, "balance": None, "error": "PROXY_API_KEY не задан"}
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                PROXY_API_BALANCE_URL,
                headers={"Authorization": f"Bearer {PROXY_API_KEY}"},
            )
            resp.raise_for_status()
            data = resp.json()
            return {"ok": True, "balance": data.get("balance"), "error": None}
    except Exception as e:
        return {"ok": False, "balance": None, "error": str(e)}
@app.get("/api/dashboard/overview")
async def dashboard_overview(current_user: UserSession = Depends(get_current_user)):

    async with httpx.AsyncClient(timeout=5.0) as client:
        (
            ltm_res, users_res, channels_res, emotes_res,
            kw_res, ur_res, settings_res,
            mem_h, hist_h, sec_h, st_h, au_h, ra_h, ww_h, tts_h,
            balance,
            kafka_data,
            bot_uptime,
        ) = await asyncio.gather(
            memory.list_ltm(),
            memory.list_users(),
            memory.list_channels(),
            memory.list_emotes(),
            memory.list_keywords(),
            memory.list_user_reactions(),
            memory.list_settings(),
            ping_service(
                client,
                MEMORY_SERVICE_URL,
                {"X-API-Key": WEBWAY_MEMORY_CLIENT_KEY},
            ) if MEMORY_SERVICE_URL else _skip(),
            ping_service(
                client,
                MESSAGE_HISTORY_SERVICE_URL,
                {"X-API-Key": WEBWAY_HISTORY_CLIENT_KEY},
            ) if MESSAGE_HISTORY_SERVICE_URL else _skip(),
            ping_service(
                client,
                SECURITY_SERVICE_URL,
                {"X-API-Key": WEBWAY_SECURITY_CLIENT_KEY},
            ) if SECURITY_SERVICE_URL else _skip(),
            ping_service(
                client,
                STORAGE_SERVICE_URL,
                {"X-API-Key": WEBWAY_STORAGE_CLIENT_KEY},
            ) if STORAGE_SERVICE_URL else _skip(),
            ping_service(
                client,
                AUDIT_SERVICE_URL,
                {"X-API-Key": WEBWAY_AUDIT_CLIENT_KEY},
            ) if AUDIT_SERVICE_URL else _skip(),
            ping_service(
                client,
                RADIO_SERVICE_URL,
                {"X-API-Key": WEBWAY_RADIO_CLIENT_KEY},
            ) if RADIO_SERVICE_URL else _skip(),
            ping_service(
                client,
                BACKEND_URL,
            ) if BACKEND_URL else _skip(),
            ping_service(
                client,
                TTS_SERVICE_URL,
                {"X-API-Key": WEBWAY_TTS_CLIENT_KEY},
            ) if TTS_SERVICE_URL else _skip(),
            get_proxy_balance(),
            get_kafka_metrics(KAFKA_BOOTSTRAP_SERVERS),
            get_bot_uptime(),
            return_exceptions=False,
        )

    def safe_list(x): return x if isinstance(x, list) else []

    ltm = safe_list(ltm_res)
    users = safe_list(users_res)
    channels = safe_list(channels_res)
    emotes = safe_list(emotes_res)
    keywords = safe_list(kw_res)
    user_reactions = safe_list(ur_res)
    settings_raw = safe_list(settings_res)

    settings = {s["key"]: s["value"] for s in settings_raw if "key" in s}

    recent_ltm = sorted(ltm, key=lambda x: x.get("id", 0), reverse=True)[:5]
    recent_users = users[:5]

    return {
        "counts": {
            "ltm": len(ltm),
            "users": len(users),
            "channels": len(channels),
            "emotes": len(emotes),
            "keywords": len(keywords),
            "user_reactions": len(user_reactions),
        },
        "services": {
            "memory": mem_h,
            "history": hist_h,
            "security": sec_h,
            "storage": st_h,
            "audit": au_h,
            "radio": ra_h,
            "webway_backend": ww_h,
            "tts": tts_h
        },
        "balance": balance,
        "kafka": kafka_data,
        "uptime": bot_uptime,
        "bot_state": {
            "model": settings.get("model", "—"),
            "thinking": settings.get("thinking", "false") == "true",
            "locked": settings.get("locked", "false") == "true",
            "longterm": settings.get("longterm", "false") == "true",
            "awareness": settings.get("awareness", "false") == "true",
            "images": settings.get("images", "false") == "true",
            "shutdown": settings.get("shutdown", "false") == "true",
            "preshutdown": settings.get("preshutdown", "false") == "true",
            "caching_limit": settings.get("caching_limit", "—"),
            "longterm_limit": settings.get("longterm_limit", "—"),
        },
        "recent": {
            "ltm": recent_ltm,
            "users": recent_users,
        },
    }


async def _skip():
    return {
        "ok": None,
        "latency_ms": None,
        "status": None,
        "uptime_seconds": None,
    }


@app.post("/api/settings")
async def update_setting_api(
    payload: SettingPayload,
    request: Request,
    current_user: UserSession = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{MEMORY_SERVICE_URL}/settings",
                json=payload.model_dump(),
                headers={"X-API-Key": WEBWAY_MEMORY_CLIENT_KEY},
            )
            resp.raise_for_status()
            await write_audit(
                request, current_user,
                action="update", entity_type="setting", entity_id=payload.key,
                details={"value": payload.value},
            )
            return resp.json()
    except Exception as e:
        await write_audit(
            request, current_user,
            action="update", entity_type="setting",
            success=False, error=str(e),
        )
        raise


@app.post("/api/settings/{key}/reset")
async def reset_setting_api(
    key: str,
    request: Request,
    current_user: UserSession = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{MEMORY_SERVICE_URL}/settings/{key}/reset",
                headers={"X-API-Key": WEBWAY_MEMORY_CLIENT_KEY},
            )
            if resp.status_code == 404:
                raise HTTPException(404, "Setting not found")
            resp.raise_for_status()
            await write_audit(
                request, current_user,
                action="reset", entity_type="setting", entity_id=key,
            )
            return resp.json()
    except Exception as e:
        await write_audit(
            request, current_user,
            action="reset", entity_type="setting",
            success=False, error=str(e),
        )
        raise

@app.get("/api/gallery")
async def gallery_list(
    limit: int = 60,
    offset: int = 0,
    favorites_only: bool = False,
    current_user: UserSession = Depends(get_current_user),
):
    url = (
        f"{STORAGE_SERVICE_URL}/favorites"
        if favorites_only
        else f"{STORAGE_SERVICE_URL}/files"
    )
    
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            url,
            params={"limit": limit, "offset": offset},
            headers={"X-API-Key": WEBWAY_STORAGE_CLIENT_KEY},
        )
        resp.raise_for_status()
        return resp.json()

@app.get("/api/gallery/file/{file_id}")
async def gallery_file(
    file_id: str,
    request: Request,
):
    sid = request.cookies.get(SESSION_COOKIE_NAME)
    if not sid:
        raise HTTPException(401, "Not authenticated")

    session_data = await session_store.get_session(sid)
    if not session_data:
        raise HTTPException(401, "Session expired")

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"{STORAGE_SERVICE_URL}/file/{file_id}",
            headers={"X-API-Key": WEBWAY_STORAGE_CLIENT_KEY}
        )
        if resp.status_code == 404:
            raise HTTPException(404, "File not found")
        resp.raise_for_status()
        return Response(
            content=resp.content,
            media_type=resp.headers.get("content-type", "image/png"),
        )

@app.delete("/api/gallery/{file_id}")
async def gallery_delete(
    file_id: str,
    request: Request,
    current_user: UserSession = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.delete(
                f"{STORAGE_SERVICE_URL}/file/{file_id}",
                headers={"X-API-Key": WEBWAY_STORAGE_CLIENT_KEY},
            )
            if resp.status_code == 404:
                raise HTTPException(404, "File not found")
            resp.raise_for_status()
            await write_audit(
                request, current_user,
                action="delete", entity_type="file", entity_id=file_id,
            )
            return {"ok": True}
    except Exception as e:
        await write_audit(
            request, current_user,
            action="delete", entity_type="file",
            success=False, error=str(e),
        )
        raise

@app.get("/api/audit")
async def list_audit_api(
    limit: int = 50,
    offset: int = 0,
    actor_id: int | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    action: str | None = None,
    success: bool | None = None,
    source_service: str | None = None,
    search: str | None = None,
    current_user: UserSession = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")

    params = {"limit": limit, "offset": offset}
    if actor_id is not None: params["actor_id"] = actor_id
    if entity_type: params["entity_type"] = entity_type
    if entity_id: params["entity_id"] = entity_id
    if action: params["action"] = action
    if success is not None: params["success"] = success
    if source_service: params["source_service"] = source_service
    if search: params["search"] = search

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{AUDIT_SERVICE_URL}/audit",
            params=params,
            headers={"X-API-Key": WEBWAY_AUDIT_CLIENT_KEY},
        )
        resp.raise_for_status()
        return resp.json()


@app.get("/api/audit/stats")
async def audit_stats_api(current_user: UserSession = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{AUDIT_SERVICE_URL}/audit/stats",
            headers={"X-API-Key": WEBWAY_AUDIT_CLIENT_KEY},
        )
        resp.raise_for_status()
        return resp.json()

@app.get("/api/dashboard/analytics")
async def dashboard_analytics(
    hours: int = Query(24, ge=1, le=168),
    days: int = Query(7, ge=1, le=30),
    current_user: UserSession = Depends(get_current_user),
):
    async with httpx.AsyncClient(timeout=10.0) as client:
        (
            summary, timeline, top_users, top_channels,
            audit_timeline,
            all_channels,
        ) = await asyncio.gather(
            client.get(f"{MESSAGE_HISTORY_SERVICE_URL}/stats/summary", headers={"X-API-Key": WEBWAY_HISTORY_CLIENT_KEY}),
            client.get(
                f"{MESSAGE_HISTORY_SERVICE_URL}/stats/timeline",
                params={"hours": hours},
                headers={"X-API-Key": WEBWAY_HISTORY_CLIENT_KEY},
            ),
            client.get(
                f"{MESSAGE_HISTORY_SERVICE_URL}/stats/top-users",
                params={"hours": hours, "limit": 10},
                headers={"X-API-Key": WEBWAY_HISTORY_CLIENT_KEY},
            ),
            client.get(
                f"{MESSAGE_HISTORY_SERVICE_URL}/stats/top-channels",
                params={"hours": hours, "limit": 10},
                headers={"X-API-Key": WEBWAY_HISTORY_CLIENT_KEY},
            ),
            client.get(
                f"{AUDIT_SERVICE_URL}/audit/stats/timeline",
                params={"days": days},
                headers={"X-API-Key": WEBWAY_AUDIT_CLIENT_KEY},
            ),
            memory.list_channels(),
            return_exceptions=True,
        )

    def _safe(resp):
        if isinstance(resp, Exception):
            return None
        if resp.status_code != 200:
            return None
        return resp.json()
    
    channels_map: dict[str, dict] = {}
    if isinstance(all_channels, list):
        for ch in all_channels:
            cid = str(ch.get("channel_id"))
            channels_map[cid] = {
                "human_name": ch.get("human_name"),
                "uid": ch.get("uid"),
            }
    
    return {
        "hours": hours,
        "days": days,
        "summary": _safe(summary),
        "timeline": _safe(timeline),
        "top_users": _safe(top_users),
        "top_channels": _safe(top_channels),
        "audit_timeline": _safe(audit_timeline),
        "channels_map": channels_map,
    }

@app.get("/api/dashboard/spending")
async def dashboard_spending(
    days: int = Query(7, ge=1, le=90),
    current_user: UserSession = Depends(get_current_user),
):

    async with httpx.AsyncClient(timeout=10.0) as client:
        results = await asyncio.gather(
            client.get(f"{AUDIT_SERVICE_URL}/usage/summary", params={"days": days}, headers={"X-API-Key": WEBWAY_AUDIT_CLIENT_KEY}),
            client.get(f"{AUDIT_SERVICE_URL}/usage/by-model", params={"days": days}, headers={"X-API-Key": WEBWAY_AUDIT_CLIENT_KEY}),
            client.get(f"{AUDIT_SERVICE_URL}/usage/by-source", params={"days": days}, headers={"X-API-Key": WEBWAY_AUDIT_CLIENT_KEY}),
            client.get(f"{AUDIT_SERVICE_URL}/usage/timeline", params={"days": days}, headers={"X-API-Key": WEBWAY_AUDIT_CLIENT_KEY}),
            client.get(f"{AUDIT_SERVICE_URL}/usage/top-users", params={"days": days, "limit": 10}, headers={"X-API-Key": WEBWAY_AUDIT_CLIENT_KEY}),
            return_exceptions=True,
        )

    def _safe(resp):
        if isinstance(resp, Exception) or resp.status_code != 200:
            return None
        return resp.json()

    summary, by_model, by_source, timeline, top_users = results
    return {
        "days": days,
        "summary": _safe(summary),
        "by_model": _safe(by_model),
        "by_source": _safe(by_source),
        "timeline": _safe(timeline),
        "top_users": _safe(top_users),
    }

@app.get("/api/eyes/channels")
async def eyes_channels(current_user: UserSession = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")
    if not DISCORD_GUILD_ID:
        raise HTTPException(500, "DISCORD_GUILD_ID is not configured")

    try:
        raw = await discord_client.list_guild_channels(DISCORD_GUILD_ID)
    except httpx.HTTPStatusError as e:
        raise HTTPException(e.response.status_code, f"Discord error: {e.response.text}")
    except Exception as e:
        raise HTTPException(502, f"Discord unavailable: {e}")

    categories = {str(c["id"]): c for c in raw if c.get("type") == CATEGORY_TYPE}
    channels = []

    for c in raw:
        if c.get("type") not in TEXT_CHANNEL_TYPES:
            continue
        parent = categories.get(c.get("parent_id"), {}) if c.get("parent_id") else {}
        channels.append({
            "id": str(c["id"]),
            "name": c.get("name"),
            "topic": c.get("topic"),
            "type": c.get("type"),
            "parent_id": c.get("parent_id"),
            "parent_name": parent.get("name"),
            "parent_position": parent.get("position", 999),
            "position": c.get("position", 0),
            "nsfw": c.get("nsfw", False),
        })

    channels.sort(key=lambda x: (x["parent_position"] if x["parent_id"] else -1, x["position"]))

    return {"guild_id": DISCORD_GUILD_ID, "channels": channels}


@app.get("/api/eyes/channels/{channel_id}/messages")
async def eyes_messages(
    channel_id: int,
    limit: int = 50,
    before: Optional[str] = None,
    current_user: UserSession = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")

    try:
        raw = await discord_client.get_channel_messages(channel_id, limit=limit, before=before)
    except httpx.HTTPStatusError as e:
        raise HTTPException(e.response.status_code, f"Discord error: {e.response.text}")
    except Exception as e:
        raise HTTPException(502, f"Discord unavailable: {e}")

    messages = []
    for m in raw:
        author = m.get("author", {})
        messages.append({
            "id": m["id"],
            "content": m.get("content", ""),
            "timestamp": m.get("timestamp"),
            "author": {
                "id": author.get("id"),
                "username": author.get("username"),
                "global_name": author.get("global_name"),
                "bot": author.get("bot", False),
                "avatar": author.get("avatar"),
            },
            "attachments": [
                {
                    "url": a["url"],
                    "filename": a.get("filename"),
                    "content_type": a.get("content_type"),
                    "size": a.get("size"),
                }
                for a in m.get("attachments", [])
            ],
            "embeds": m.get("embeds", []),
            "referenced_message": (
                {
                    "id": m["referenced_message"]["id"],
                    "content": m["referenced_message"].get("content", "")[:200],
                    "author_username": m["referenced_message"].get("author", {}).get("username"),
                }
                if m.get("referenced_message")
                else None
            ),
        })

    return {"channel_id": channel_id, "messages": messages}

class SendMessagePayload(BaseModel):
    content: str = Field(..., min_length=1, max_length=2000)
    reply_to: str | None = None


@app.post("/api/eyes/channels/{channel_id}/send")
async def eyes_send(
    channel_id: int,
    payload: SendMessagePayload,
    request: Request,
    current_user: UserSession = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")

    try:
        result = await discord_client.send_message(channel_id, payload.content, reply_to=payload.reply_to)
    except httpx.HTTPStatusError as e:
        await write_audit(
            request, current_user,
            action="send_message", entity_type="channel",
            entity_id=str(channel_id), success=False,
            error=f"Discord {e.response.status_code}",
            details={"content_preview": payload.content[:100]},
        )
        raise HTTPException(e.response.status_code, f"Discord error: {e.response.text}")
    except Exception as e:
        raise HTTPException(502, f"Discord unavailable: {e}")

    await write_audit(
        request, current_user,
        action="send_message", entity_type="channel",
        entity_id=str(channel_id),
        details={
            "content_preview": payload.content[:100],
            "message_id": result.get("id"),
        },
    )
    return {"ok": True, "message_id": result.get("id")}

class TriviaCreatePayload(BaseModel):
    kind: str = Field(..., pattern="^(fact|rule)$")
    content: str = Field(..., min_length=1, max_length=1000)


@app.get("/api/users/{uid}/trivia")
async def get_trivia_proxy(uid: str, current_user: UserSession = Depends(get_current_user)):
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{MEMORY_SERVICE_URL}/users/{uid}/trivia",
            headers={"X-API-Key": WEBWAY_MEMORY_CLIENT_KEY},
        )
        resp.raise_for_status()
        return resp.json()


@app.post("/api/users/{uid}/trivia")
async def add_trivia_proxy(
    uid: str,
    payload: TriviaCreatePayload,
    request: Request,
    current_user: UserSession = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{MEMORY_SERVICE_URL}/users/{uid}/trivia",
            json=payload.model_dump(),
            headers={"X-API-Key": WEBWAY_MEMORY_CLIENT_KEY},
        )
        resp.raise_for_status()
        result = resp.json()
    await write_audit(
        request, current_user,
        action="create", entity_type="trivia", entity_id=str(result["id"]),
        details={"user_uid": uid, "kind": payload.kind},
    )
    return result


@app.delete("/api/trivia/{item_id}")
async def delete_trivia_proxy(
    item_id: int,
    request: Request,
    current_user: UserSession = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")
    async with httpx.AsyncClient() as client:
        resp = await client.delete(
            f"{MEMORY_SERVICE_URL}/trivia/{item_id}",
            headers={"X-API-Key": WEBWAY_MEMORY_CLIENT_KEY},
        )
        if resp.status_code == 404:
            raise HTTPException(404, "Item not found")
        resp.raise_for_status()
    await write_audit(
        request, current_user,
        action="delete", entity_type="trivia", entity_id=str(item_id),
    )
    return {"ok": True}

@app.post("/api/gallery/{file_id}/favorite")
async def gallery_favorite(
    file_id: str,
    request: Request,
    current_user: UserSession = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{STORAGE_SERVICE_URL}/file/{file_id}/favorite",
            headers={"X-API-Key": WEBWAY_STORAGE_CLIENT_KEY},
        )
        resp.raise_for_status()
    await write_audit(
        request, current_user,
        action="favorite", entity_type="file", entity_id=file_id,
    )
    return {"ok": True}


@app.delete("/api/gallery/{file_id}/favorite")
async def gallery_unfavorite(
    file_id: str,
    request: Request,
    current_user: UserSession = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")
    async with httpx.AsyncClient() as client:
        resp = await client.delete(
            f"{STORAGE_SERVICE_URL}/file/{file_id}/favorite",
            headers={"X-API-Key": WEBWAY_STORAGE_CLIENT_KEY},
        )
        resp.raise_for_status()
    await write_audit(
        request, current_user,
        action="unfavorite", entity_type="file", entity_id=file_id,
    )
    return {"ok": True}


@app.post("/api/discord/users/batch")
async def discord_users_batch(
    payload: BatchUsersPayload,
    current_user: UserSession = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")
    ids = payload.ids[:100]
    if not ids:
        return {"users": {}}
    try:
        users = await discord_client.batch_get_users(ids)
    except Exception as e:
        raise HTTPException(502, f"Discord unavailable: {e}")
    return {
        "users": {
            str(uid): {
                "id": u["id"],
                "username": u["username"],
                "global_name": u.get("global_name"),
                "avatar": u.get("avatar"),
                "bot": u.get("bot", False),
            }
            for uid, u in users.items()
        }
    }

@app.get("/api/radio/songs")
async def radio_list_songs(
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    search: str | None = None,
    current_user: UserSession = Depends(get_current_user),
):
    return await radio.list_songs(limit=limit, offset=offset, search=search)


@app.post("/api/radio/songs")
async def radio_upload_song(
    request: Request,
    file: UploadFile = File(...),
    title: str = Form(...),
    artist: str = Form(""),
    description: str = Form(""),
    current_user: UserSession = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")

    if not file.filename.lower().endswith(".mp3"):
        raise HTTPException(400, "Only .mp3 files accepted")

    data = await file.read()
    if len(data) == 0:
        raise HTTPException(400, "Empty file")
    if len(data) > 50 * 1024 * 1024:
        raise HTTPException(413, "File too large (max 50 MB)")

    try:
        song = await radio.upload_song(
            data, file.filename,
            {
                "title": title.strip()[:200],
                "artist": (artist or "").strip()[:200],
                "description": (description or "").strip()[:1000],
                "uploaded_by": current_user.user_id,
                "uploaded_by_username": current_user.username,
            },
        )
    except httpx.HTTPStatusError as e:
        raise HTTPException(e.response.status_code, f"Radio service error: {e.response.text}")

    await write_audit(
        request, current_user,
        action="upload", entity_type="radio_song", entity_id=str(song["id"]),
        details={"title": title, "size": len(data)},
    )
    return song


@app.patch("/api/radio/songs/{song_id}")
async def radio_update_song(
    song_id: int,
    payload: dict,
    request: Request,
    current_user: UserSession = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")

    allowed = {"title", "artist", "description", "announce_title"}
    clean = {k: v for k, v in payload.items() if k in allowed}
    if not clean:
        raise HTTPException(400, "No valid fields")

    song = await radio.update_song(song_id, clean)
    if not song:
        raise HTTPException(404, "Song not found")

    await write_audit(
        request, current_user,
        action="update", entity_type="radio_song", entity_id=str(song_id),
        details=clean,
    )
    return song


@app.delete("/api/radio/songs/{song_id}")
async def radio_delete_song(
    song_id: int,
    request: Request,
    current_user: UserSession = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")

    if not await radio.delete_song(song_id):
        raise HTTPException(404, "Song not found")

    await write_audit(
        request, current_user,
        action="delete", entity_type="radio_song", entity_id=str(song_id),
    )
    return {"ok": True}


@app.get("/api/radio/now")
async def radio_now(current_user: UserSession = Depends(get_current_user)):
    return await radio.now_playing()


@app.post("/api/radio/skip")
async def radio_skip(
    request: Request,
    current_user: UserSession = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")

    await radio.skip(current_user.user_id, current_user.username)
    await write_audit(
        request, current_user,
        action="skip", entity_type="radio",
    )
    return {"ok": True}


@app.get("/api/radio/history")
async def radio_history(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: UserSession = Depends(get_current_user),
):
    return await radio.history(limit=limit, offset=offset)

@app.post("/api/radio/normalize-all")
async def radio_normalize_all(
    request: Request,
    current_user: UserSession = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{RADIO_SERVICE_URL}/maintenance/normalize-all",
            headers={"X-API-Key": WEBWAY_RADIO_CLIENT_KEY},
            timeout=15.0,
        )
        resp.raise_for_status()

    await write_audit(
        request, current_user,
        action="normalize_all", entity_type="radio",
    )
    return {"ok": True}

@app.get("/api/radio/queue")
async def radio_queue_list(current_user: UserSession = Depends(get_current_user)):
    return await radio.queue_list()


@app.post("/api/radio/queue/{song_id}")
async def radio_queue_add(
    song_id: int,
    request: Request,
    current_user: UserSession = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")

    ok = await radio.queue_add(song_id)
    if not ok:
        raise HTTPException(404, "Song not found")

    song = await radio.get_song(song_id)
    await write_audit(
        request, current_user,
        action="queue_add", entity_type="radio_song", entity_id=str(song_id),
        details={"title": song.get("title") if song else None},
    )
    return {"ok": True}

@app.delete("/api/radio/queue/next")
async def radio_queue_remove_next(
    request: Request,
    current_user: UserSession = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")

    ok = await radio.queue_remove_next()
    if not ok:
        raise HTTPException(404, "No next song")

    await write_audit(
        request, current_user,
        action="queue_remove", entity_type="radio_song", entity_id="next",
    )
    return {"ok": True}

@app.delete("/api/radio/queue/{song_id}")
async def radio_queue_remove(
    song_id: int,
    request: Request,
    current_user: UserSession = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")

    ok = await radio.queue_remove(song_id)
    if not ok:
        raise HTTPException(404, "Not in queue")

    await write_audit(
        request, current_user,
        action="queue_remove", entity_type="radio_song", entity_id=str(song_id),
    )
    return {"ok": True}


@app.delete("/api/radio/queue")
async def radio_queue_clear(
    request: Request,
    current_user: UserSession = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")
    result = await radio.queue_clear()
    await write_audit(
        request, current_user,
        action="queue_clear", entity_type="radio",
        details={"removed": result.get("removed", 0)},
    )
    return result

@app.post("/api/radio/voice/command")
async def radio_voice_command(
    payload: VoiceCommand,
    request: Request,
    current_user: UserSession = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")

    r = await get_redis()
    await r.publish("voice:commands", json.dumps(payload.model_dump(exclude_none=True)))

    await write_audit(
        request, current_user,
        action=f"voice_{payload.cmd}", entity_type="radio",
        details=payload.model_dump(exclude_none=True),
    )
    return {"ok": True}


@app.get("/api/discord/voice-channels")
async def list_voice_channels(current_user: UserSession = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")
    
    if not DISCORD_GUILD_ID:
        raise HTTPException(500, "DISCORD_GUILD_ID not configured")

    try:
        raw = await discord_client.list_guild_channels(DISCORD_GUILD_ID)
    except Exception as e:
        raise HTTPException(502, f"Discord unavailable: {e}")

    voice = [c for c in raw if c.get("type") in (2, 13)]  # voice, stage
    return {
        "channels": [
            {"id": str(c["id"]), "name": c.get("name"), "parent_id": str(c["parent_id"]) if c.get("parent_id") else None}
            for c in voice
        ]
    }

@app.get("/api/radio/voice/status")
async def radio_voice_status(current_user: UserSession = Depends(get_current_user)):
    r = await get_redis()
    raw = await r.get("voice:status")
    if not raw:
        return {"enabled": False, "connected": False, "playing": False, "volume": 0.7}
    return json.loads(raw)

@app.get("/api/dashboard/heartbeats")
async def dashboard_heartbeats(current_user: UserSession = Depends(get_current_user)):
    r = await get_redis()
    now = datetime.now(timezone.utc)
    result = []
    for name, meta in EXPECTED_WORKERS.items():
        ts_str = await r.get(f"heartbeat:{name}")
        age_sec = None
        alive = False
        if ts_str:
            try:
                ts = datetime.fromisoformat(ts_str)
                age_sec = (now - ts).total_seconds()
                alive = age_sec < STALE_AFTER_SEC
            except Exception:
                pass
        result.append({
            "service": name,
            "label": meta["label"],
            "alive": alive,
            "seconds_since": round(age_sec, 1) if age_sec is not None else None,
        })
    return {"services": result}

from datetime import datetime, timezone
BOOT_TIME = datetime.now(timezone.utc)

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "uptime_seconds": int((datetime.now(timezone.utc) - BOOT_TIME).total_seconds()),
    }

@app.get("/api/tts/voices")
async def tts_voices():
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.get(
            f"{TTS_SERVICE_URL}/voices",
            headers={"X-API-Key": WEBWAY_TTS_CLIENT_KEY}
        )
        r.raise_for_status()
        return r.json()


class TTSPreviewPayload(BaseModel):
    text: str = Field(..., min_length=1, max_length=500)
    voice: str = Field(..., min_length=1, max_length=32)


@app.post("/api/tts/preview")
async def tts_preview(
    payload: TTSPreviewPayload,
):
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(
            f"{TTS_SERVICE_URL}/synthesize",
            json=payload.model_dump(),
            headers={"X-API-Key": WEBWAY_TTS_CLIENT_KEY},
        )
        if r.status_code != 200:
            raise HTTPException(r.status_code, r.text)
        return Response(content=r.content, media_type="audio/mpeg")

@app.get("/api/radio/settings")
async def radio_settings_get(current_user: UserSession = Depends(get_current_user)):
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{RADIO_SERVICE_URL}/settings",
            headers={"X-API-Key": WEBWAY_RADIO_CLIENT_KEY},
        )
        r.raise_for_status()
        return r.json()


@app.patch("/api/radio/settings")
async def radio_settings_patch(
    payload: dict,
    request: Request,
    current_user: UserSession = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")
    async with httpx.AsyncClient() as client:
        r = await client.patch(
            f"{RADIO_SERVICE_URL}/settings",
            json=payload,
            headers={"X-API-Key": WEBWAY_TTS_CLIENT_KEY},
        )
        r.raise_for_status()
        result = r.json()
    await write_audit(
        request, current_user,
        action="radio_settings_update", entity_type="radio",
        details=payload,
    )
    return result


@app.get("/api/tts/voices")
async def tts_voices(current_user: UserSession = Depends(get_current_user)):
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{TTS_SERVICE_URL}/voices",
            headers={"X-API-Key": WEBWAY_TTS_CLIENT_KEY},
        )
        r.raise_for_status()
        return r.json()


class TTSPreview(BaseModel):
    text: str = Field(..., min_length=1, max_length=500)
    voice: str = Field(..., min_length=1, max_length=32)


@app.post("/api/tts/preview")
async def tts_preview(
    payload: TTSPreview,
    current_user: UserSession = Depends(get_current_user),
):
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(
            f"{TTS_SERVICE_URL}/synthesize",
            json=payload.model_dump(),
            headers={"X-API-Key": WEBWAY_TTS_CLIENT_KEY},
        )
        if r.status_code != 200:
            raise HTTPException(r.status_code, r.text)
        from fastapi.responses import Response
        return Response(content=r.content, media_type="audio/mpeg")

class TranslitPayload(BaseModel):
    text: str = Field(..., min_length=1, max_length=500)


@app.post("/api/tts/translit")
async def tts_translit(
    payload: TranslitPayload,
    current_user: UserSession = Depends(get_current_user),
):
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.post(
            f"{TTS_SERVICE_URL}/translit",
            json=payload.model_dump(),
            headers={"X-API-Key": WEBWAY_TTS_CLIENT_KEY},
        )
        r.raise_for_status()
        return r.json()