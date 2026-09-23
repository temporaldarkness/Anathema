import httpx
import logging
from .config import DISCORD_TOKEN

logger = logging.getLogger(__name__)

class DiscordClient:
    def __init__(self):
        self.client = httpx.AsyncClient(
            base_url="https://discord.com/api/v10",
            headers={"Authorization": f"Bot {DISCORD_TOKEN}"},
            timeout=10.0
        )
    
    async def get_guild_owner(self, guild_id: int) -> int:
        resp = await self.client.get(f"/guilds/{guild_id}")
        if resp.status_code != 200:
            raise Exception(f"Failed to get guild: {resp.status_code}")
        data = resp.json()
        return int(data["owner_id"])
    
    async def get_guild_roles(self, guild_id: int):
        resp = await self.client.get(f"/guilds/{guild_id}")
        if resp.status_code != 200:
            raise Exception(f"Failed to get roles: {resp.status_code}")
        data = resp.json()
        return [{"id": int(r["id"]), "permissions": int(r["permissions"])} for r in data]
    
    async def get_member_roles(guild_id, user_id: int):
        resp = await self.client.get(f"/guilds/{guild_id}/members/{user_id}")
        if resp.status_code != 200:
            raise Exception(f"Failed to get roles: {resp.status_code}")
        data = resp.json()
        return [int(r) for r in data.get("roles", [])]
    
    async def close(self):
        await self.client.aclose()