import json
from .redis_client import get_redis
from .discord_client import DiscordClient
from .config import SUPERUSER_ID

discord_client = DiscordClient()

def get_superuser_uids():
    return [SUPERUSER_ID]

async def get_guild_owner(guild_id: int) -> int:
    redis = await get_redis()
    cache_key = f"guild:{guild_id}:owner"
    owner_id = await redis.get(cache_key)
    if owner_id:
        return int(owner_id)
    owner_id = await discord_client.get_guild_owner(guild_id)
    await redis.setex(cache_key, 3600, str(owner_id))
    return owner_id

async def get_guild_roles(guild_id: int):
    redis = await get_redis()
    cache_key = f"guild:{guild_id}:roles"
    cached = await redis.get(cache_key)
    if cached:
        import json
        return json.loads(cached)
    roles = await discord_client.get_guild_roles(guild_id)
    await redis.setex(cache_key, 600, json.dumps(roles))
    return roles

async def get_member_roles(guild_id: int, user_id: int):
    redis = await get_redis()
    cache_key = f"guild:{guild_id}:member:{user_id}:roles"
    cached = await redis.get(cache_key)
    if cached:
        return json.loads(cached)
    roles = await discord_client.get_member_roles(guild_id, user_id)
    await redis.setex(cache_key, 600, json.dumps(roles))
    return roles

async def is_guild_owner(guild_id: int, user_id: int) -> bool:
    owner_id = await get_guild_owner(guild_id)
    return user_id == owner_id

async def is_guild_admin(guild_id: int, user_id: int) -> bool:
    if await is_guild_owner(guild_id, user_id):
        return True
    
    user_roles = await get_member_roles(guild_id, user_id)
    guild_roles = await get_guild_roles(guild_id)
    admin_permission = 0x8
    for role in guild_roles:
        if role["id"] in user_roles and (role["permissions"] & admin_permission):
            return True
    return False
    

async def check_permission(guild_id: int, user_id: int, user_uid: str, permission: str):
    redis = await get_redis()
    cache_key = f"perm:{guild_id}:{user_id}:{permission}"
    cached = await redis.get(cache_key)
    if cached is not None:
        return cached == "true"
    
    result = False
    if permission == "superuser":
        result = user_uid in get_superuser_uids()
    elif permission == "admin":
        result = await is_guild_admin(guild_id, user_id)
    
    await redis.setex(cache_key, 300, "true" if result else "false")
    return result

async def close():
    await discord_client.close()