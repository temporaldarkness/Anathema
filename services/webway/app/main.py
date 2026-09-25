from datetime import datetime, timedelta, timezone
from typing import Optional, List, Union

import httpx
from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.responses import RedirectResponse
from jose import JWTError, jwt
from pydantic import BaseModel, Field, field_validator
import asyncio
from .memory_client import MemoryClient
import time
import redis.asyncio as redis
from .kafka_metrics import get_kafka_metrics

from .config import DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_REDIRECT_URI, DISCORD_GUILD_ID, JWT_SECRET_KEY, JWT_ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES, COOKIE_SECURE, WEBWAY_MEMORY_CLIENT_KEY, WEBWAY_SECURITY_CLIENT_KEY, WEBWAY_HISTORY_CLIENT_KEY, WEBWAY_STORAGE_CLIENT_KEY, MEMORY_SERVICE_URL, MESSAGE_HISTORY_SERVICE_URL, SECURITY_SERVICE_URL, STORAGE_SERVICE_URL, DISCORD_TOKEN, PROXY_API_BALANCE_URL, PROXY_API_KEY, KAFKA_BOOTSTRAP_SERVERS, REDIS_URL

CHANNEL_TYPES = {
    0: "Текстовый",
    2: "Голосовой",
    4: "Категория",
    5: "Анонсы",
    13: "Стрим",
    15: "Форум",
    16: "Медиа",
}

app = FastAPI(title="Anathema Security Service")

class UserSession(BaseModel):
    user_id: str
    username: str
    avatar_url: str | None = None
    is_admin: bool
    
    @field_validator("user_id", mode="before")
    @classmethod
    def coerce_user_id(cls, v):
        return str(v) if v is not None else v

class LTMItem(BaseModel):
    fact: str

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

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)

async def get_current_user(request: Request) -> UserSession:
    token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return UserSession(**payload)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

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
async def discord_login():
    params = {
        "client_id": DISCORD_CLIENT_ID,
        "redirect_uri": DISCORD_REDIRECT_URI,
        "response_type": "code",
        "scope": "identify guilds",
    }
    query_string = "&".join(f"{k}={v}" for k, v in params.items())
    return RedirectResponse(f"https://discord.com/api/oauth2/authorize?{query_string}")

def build_avatar_url(user: dict) -> str | None:
    if not user.get("avatar"):
        return None
    ext = "gif" if user["avatar"].startswith("a_") else "png"
    return f"https://cdn.discordapp.com/avatars/{user['id']}/{user['avatar']}.{ext}"

@app.get("/auth/discord/callback")
async def discord_callback(code: str):
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

    jwt_token = create_access_token(
        {"user_id": str(user["id"]), "username": user["username"], "avatar_url": avatar_url, "is_admin": is_admin}
    )
    
    response = RedirectResponse(url="/dashboard", status_code=303)
    response.set_cookie(
        key="access_token",
        value=jwt_token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )
    return response

@app.post("/auth/logout")
async def logout():
    response = RedirectResponse(url="/", status_code=303)
    response.delete_cookie("access_token")
    return response

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

@app.on_event("shutdown")
async def shutdown():
    await memory.close()

@app.get("/api/ltm")
async def list_ltm(current_user: UserSession = Depends(get_current_user)):
    return await memory.list_ltm()

@app.post("/api/ltm")
async def create_ltm(item: LTMItem, current_user: UserSession = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{MEMORY_SERVICE_URL}/ltm",
            json={"fact": item.fact},
            headers={"X-API-Key": WEBWAY_MEMORY_CLIENT_KEY}
        )
        resp.raise_for_status()
        return resp.json()

@app.delete("/api/ltm/{fact_id}")
async def delete_ltm(fact_id: int, current_user: UserSession = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")
    async with httpx.AsyncClient() as client:
        resp = await client.delete(
            f"{MEMORY_SERVICE_URL}/ltm/{fact_id}",
            headers={"X-API-Key": WEBWAY_MEMORY_CLIENT_KEY}
        )
        resp.raise_for_status()
        return {"ok": True}

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
    current_user: UserSession = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")
    
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
    
    return resp.json()

@app.delete("/api/users/{uid}")
async def delete_user_api(
    uid: str,
    current_user: UserSession = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")

    async with httpx.AsyncClient() as client:
        resp = await client.delete(
            f"{MEMORY_SERVICE_URL}/users/{uid}",
            headers={"X-API-Key": WEBWAY_MEMORY_CLIENT_KEY},
        )
        if resp.status_code == 404:
            raise HTTPException(404, "User not found")
        resp.raise_for_status()
        return {"ok": True}

@app.get("/api/discord/user/{user_id}")
async def fetch_discord_user(
    user_id: int,
    current_user: UserSession = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")

    token = DISCORD_TOKEN
    if not token:
        raise HTTPException(500, "Discord token not configured")

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"https://discord.com/api/v10/users/{user_id}",
            headers={"Authorization": f"Bot {token}"},
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

@app.get("/api/channels")
async def list_channels_api(current_user: UserSession = Depends(get_current_user)):
    return await memory.list_channels()

@app.post("/api/channels")
async def upsert_channel_api(
    payload: ChannelPayload,
    current_user: UserSession = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{MEMORY_SERVICE_URL}/channels",
            json=payload.model_dump(),
            headers={"X-API-Key": WEBWAY_MEMORY_CLIENT_KEY},
        )
        resp.raise_for_status()
        return resp.json()

@app.delete("/api/channels/{uid}")
async def delete_channel_api(
    uid: str,
    current_user: UserSession = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")

    async with httpx.AsyncClient() as client:
        resp = await client.delete(
            f"{MEMORY_SERVICE_URL}/channels/{uid}",
            headers={"X-API-Key": WEBWAY_MEMORY_CLIENT_KEY},
        )
        if resp.status_code == 404:
            raise HTTPException(404, "Channel not found")
        resp.raise_for_status()
        return {"ok": True}

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
    current_user: UserSession = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{MEMORY_SERVICE_URL}/emotes",
            json=payload.model_dump(),
            headers={"X-API-Key": WEBWAY_MEMORY_CLIENT_KEY},
        )
        resp.raise_for_status()
        return resp.json()


@app.delete("/api/emotes/{uid}")
async def delete_emote_api(
    uid: str,
    current_user: UserSession = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")
    async with httpx.AsyncClient() as client:
        resp = await client.delete(
            f"{MEMORY_SERVICE_URL}/emotes/{uid}",
            headers={"X-API-Key": WEBWAY_MEMORY_CLIENT_KEY},
        )
        if resp.status_code == 404:
            raise HTTPException(404, "Emote not found")
        resp.raise_for_status()
        return {"ok": True}

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
    current_user: UserSession = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{MEMORY_SERVICE_URL}/keywords",
            json={"keyword": payload.keyword, "emoji_uid": payload.emoji_uid},
            headers={"X-API-Key": WEBWAY_MEMORY_CLIENT_KEY},
        )
        resp.raise_for_status()
        return resp.json()


@app.delete("/api/keywords/{keyword_id}")
async def delete_keyword_api(
    keyword_id: str,
    current_user: UserSession = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")
    async with httpx.AsyncClient() as client:
        resp = await client.delete(
            f"{MEMORY_SERVICE_URL}/keywords/{keyword_id}",
            headers={"X-API-Key": WEBWAY_MEMORY_CLIENT_KEY},
        )
        if resp.status_code == 404:
            raise HTTPException(404, "Keyword not found")
        resp.raise_for_status()
        return {"ok": True}


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
    current_user: UserSession = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{MEMORY_SERVICE_URL}/user_reactions",
            json={"user_uid": payload.user_uid, "emoji_uid": payload.emoji_uid},
            headers={"X-API-Key": WEBWAY_MEMORY_CLIENT_KEY},
        )
        resp.raise_for_status()
        return resp.json()


@app.delete("/api/user_reactions/{reaction_id}")
async def delete_user_reaction_api(
    reaction_id: str,
    current_user: UserSession = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")
    async with httpx.AsyncClient() as client:
        resp = await client.delete(
            f"{MEMORY_SERVICE_URL}/user_reactions/{reaction_id}",
            headers={"X-API-Key": WEBWAY_MEMORY_CLIENT_KEY},
        )
        if resp.status_code == 404:
            raise HTTPException(404, "Reaction not found")
        resp.raise_for_status()
        return {"ok": True}

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
            # Списки из Memory Service
            ltm_res, users_res, channels_res, emotes_res,
            kw_res, ur_res, settings_res,
            # Health-check'и сервисов
            mem_h, hist_h, sec_h, st_h,
            # Прочее
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

@app.get("/api/settings")
async def list_settings_api(current_user: UserSession = Depends(get_current_user)):
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{MEMORY_SERVICE_URL}/settings",
            headers={"X-API-Key": WEBWAY_MEMORY_CLIENT_KEY},
        )
        resp.raise_for_status()
        return resp.json()


@app.post("/api/settings")
async def update_setting_api(
    payload: SettingPayload,
    current_user: UserSession = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{MEMORY_SERVICE_URL}/settings",
            json=payload.model_dump(),
            headers={"X-API-Key": WEBWAY_MEMORY_CLIENT_KEY},
        )
        resp.raise_for_status()
        return resp.json()


@app.post("/api/settings/{key}/reset")
async def reset_setting_api(
    key: str,
    current_user: UserSession = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{MEMORY_SERVICE_URL}/settings/{key}/reset",
            headers={"X-API-Key": WEBWAY_MEMORY_CLIENT_KEY},
        )
        if resp.status_code == 404:
            raise HTTPException(404, "Setting not found")
        resp.raise_for_status()
        return resp.json()

@app.get("/api/gallery")
async def gallery_list(
    limit: int = 60,
    offset: int = 0,
    current_user: UserSession = Depends(get_current_user),
):
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{STORAGE_SERVICE_URL}/files",
            params={"limit": limit, "offset": offset},
            headers={"X-API-Key": WEBWAY_STORAGE_CLIENT_KEY},
        )
        resp.raise_for_status()
        return resp.json()


@app.delete("/api/gallery/{file_id}")
async def gallery_delete(
    file_id: str,
    current_user: UserSession = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")
    async with httpx.AsyncClient() as client:
        resp = await client.delete(
            f"{STORAGE_SERVICE_URL}/file/{file_id}",
            headers={"X-API-Key": WEBWAY_STORAGE_CLIENT_KEY},
        )
        if resp.status_code == 404:
            raise HTTPException(404, "File not found")
        resp.raise_for_status()
        return {"ok": True}
