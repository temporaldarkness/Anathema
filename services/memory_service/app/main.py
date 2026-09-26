import logging
from fastapi import FastAPI, HTTPException, Query
from .db import init_db, close_db
from .kafka_producer import close_producer, publish_cache_invalidation
from .redis_client import close_redis
from .models import ChannelBase, EmoteBase, KeywordReactionCreate, UserReactionCreate, Setting, UserBase, LTMItemCreate
from .crud_channels import get_channels, get_channel, get_channel_discord, upsert_channel, delete_channel
from .crud_emotes import get_emotes, get_emote, upsert_emote, delete_emote
from .crud_keywords import get_keywords, add_keyword, delete_keyword
from .crud_ltm import get_facts, add_fact, delete_fact
from .crud_settings import get_settings, get_setting, upsert_setting, delete_setting
from .crud_user_reactions import get_user_reactions, add_user_reaction, delete_user_reaction
from .crud_users import get_users, get_user, get_user_discord, upsert_user, delete_user, UserConflictError
from .config import DEFAULT_SETTINGS, MEMORY_CACHE_TTL_SECONDS
from .auth import verify_api_key
from .middleware import AuthAndLogMiddleware
from datetime import datetime, timezone
from typing import Optional

BOOT_TIME = datetime.now(timezone.utc)

logging.basicConfig(
    level=logging.DEBUG,
    format = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)

app = FastAPI(title="Anathema Memory Service")
app.add_middleware(AuthAndLogMiddleware)

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "uptime_seconds": int((datetime.now(timezone.utc) - BOOT_TIME).total_seconds()),
    }

@app.on_event("startup")
async def startup():
    await init_db()

@app.on_event("shutdown")
async def shutdown():
    await close_db()
    await close_producer()
    await close_redis()


@app.get("/channels")
async def list_channels():
    return await get_channels()

@app.get("/channels/{uid}")
async def fetch_channel_discord(uid: str):
    channel = await get_channel(uid)
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    return channel

@app.get("/channels/discord/{channel_id}")
async def fetch_channel(channel_id: int):
    channel = await get_channel_discord(channel_id)
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    return channel

@app.post("/channels")
async def update_channel(channel: ChannelBase):
    new_channel = await upsert_channel(channel)
    await publish_cache_invalidation("channel", "update", new_channel.uid)
    return new_channel

@app.delete("/channels/{uid}")
async def remove_channel(uid: str):
    deleted = await delete_channel(uid)
    if not deleted:
        raise HTTPException(status_code=404, detail="Channel not found")
    await publish_cache_invalidation("channel", "delete", uid)
    return {"ok": True}


@app.get("/emotes")
async def list_emotes():
    return await get_emotes()

@app.get("/emotes/{uid}")
async def fetch_emote(uid: str):
    emote = await get_emote(uid)
    if not emote:
        raise HTTPException(status_code=404, detail="Emote not found")
    return emote

@app.post("/emotes")
async def update_emote(emote: EmoteBase):
    new_emote = await upsert_emote(emote)
    await publish_cache_invalidation("emote", "update", new_emote.uid)
    return new_emote

@app.delete("/emotes/{uid}")
async def remove_emote(uid: str):
    deleted = await delete_emote(uid)
    if not deleted:
        raise HTTPException(status_code=404, detail="Emote not found")
    await publish_cache_invalidation("emote", "delete", uid)
    return {"ok": True}


@app.get("/keywords")
async def list_keywords():
    return await get_keywords()

@app.post("/keywords")
async def update_keyword(keyword: KeywordReactionCreate):
    new_keyword = await add_keyword(keyword)
    await publish_cache_invalidation("keyword", "update", new_keyword.id)
    return new_keyword

@app.delete("/keywords/{keyword_id}")
async def remove_keyword(keyword_id: int):
    deleted = await delete_keyword(keyword_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Keyword reaction not found")
    await publish_cache_invalidation("keyword", "delete", keyword_id)
    return {"ok": True}


@app.get("/ltm")
async def list_facts():
    return await get_facts()

@app.post("/ltm")
async def update_fact(fact: LTMItemCreate):
    new_fact = await add_fact(fact)
    await publish_cache_invalidation("fact", "update", new_fact.id)
    return new_fact

@app.delete("/ltm/{fact_id}")
async def remove_fact(fact_id: int):
    deleted = await delete_fact(fact_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Fact not found")
    await publish_cache_invalidation("fact", "delete", fact_id)
    return {"ok": True}


@app.get("/settings")
async def list_settings():
    return await get_settings()

@app.get("/settings/{key}")
async def fetch_setting(key: str):
    setting = await get_setting(key)
    if not setting:
        raise HTTPException(status_code=404, detail="Setting not found")
    return setting

@app.post("/settings/{key}/reset")
async def reset_setting(key: str):
    if key not in DEFAULT_SETTINGS:
        raise HTTPException(404, "No default value for this key")
    new_setting = await upsert_setting(Setting(key=key, value=DEFAULT_SETTINGS[key]))
    await publish_cache_invalidation("setting", "reset", key)
    return new_setting

@app.post("/settings")
async def update_setting(setting: Setting):
    new_setting = await upsert_setting(setting)
    await publish_cache_invalidation("setting", "update", new_setting.key)
    return new_setting

@app.delete("/settings/{key}")
async def remove_setting(key: str):
    deleted = await delete_setting(key)
    if not deleted:
        raise HTTPException(status_code=404, detail="Setting not found")
    await publish_cache_invalidation("setting", "delete", key)
    return {"ok": True}


@app.get("/user_reactions")
async def list_user_reactions():
    return await get_user_reactions()

@app.post("/user_reactions")
async def update_user_reaction(user_reaction: UserReactionCreate):
    new_user_reaction = await add_user_reaction(user_reaction)
    await publish_cache_invalidation("user_reaction", "update", new_user_reaction.id)
    return new_user_reaction

@app.delete("/user_reactions/{reaction_id}")
async def remove_user_reaction(reaction_id: int):
    deleted = await delete_user_reaction(reaction_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="User reaction not found")
    await publish_cache_invalidation("user_reaction", "delete", reaction_id)
    return {"ok": True}


@app.get("/users")
async def list_users():
    return await get_users()

@app.get("/users/{uid}")
async def fetch_user(uid: str):
    user = await get_user(uid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@app.get("/users/discord/{channel_id}")
async def fetch_user_discord(channel_id: int):
    user = await get_user_discord(channel_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@app.post("/users")
async def update_user(user: UserBase):
    try:
        new_user = await upsert_user(user)
    except UserConflictError as e:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "unique_violation",
                "field": e.conflict_field,
                "message": "Discord ID уже привязан к другому uid",
            },
        )
    await publish_cache_invalidation("user", "update", new_user.uid)
    return new_user

@app.delete("/users/{uid}")
async def remove_user(uid: str):
    deleted = await delete_user(uid)
    if not deleted:
        raise HTTPException(status_code=404, detail="User not found")
    await publish_cache_invalidation("user", "delete", uid)
    return {"ok": True}