import logging
import httpx
from .config import DISCORD_TOKEN
import asyncio

logger = logging.getLogger(__name__)

DISCORD_API = "https://discord.com/api/v10"


class DiscordClient:
    def __init__(self):
        if not DISCORD_TOKEN:
            logger.warning("DISCORD_TOKEN is not set — Eyes features will fail")
        self.client = httpx.AsyncClient(
            base_url=DISCORD_API,
            headers={"Authorization": f"Bot {DISCORD_TOKEN}"},
            timeout=15.0,
        )

    async def list_guild_channels(self, guild_id: int):
        resp = await self.client.get(f"/guilds/{guild_id}/channels")
        resp.raise_for_status()
        return resp.json()

    async def get_channel(self, channel_id: int):
        resp = await self.client.get(f"/channels/{channel_id}")
        resp.raise_for_status()
        return resp.json()

    async def get_channel_messages(
        self,
        channel_id: int,
        limit: int = 50,
        before: str | None = None,
        after: str | None = None,
    ):
        params = {"limit": min(max(limit, 1), 100)}
        if before:
            params["before"] = before
        if after:
            params["after"] = after
        resp = await self.client.get(f"/channels/{channel_id}/messages", params=params)
        resp.raise_for_status()
        return resp.json()

    async def send_message(self, channel_id: int, content: str, reply_to: str | None = None):
        payload: dict = {"content": content}
        if reply_to:
            payload["message_reference"] = {"message_id": reply_to}
            
        resp = await self.client.post(
            f"/channels/{channel_id}/messages",
            json=payload,
        )
        resp.raise_for_status()
        return resp.json()

    async def close(self):
        await self.client.aclose()
    
    async def batch_get_users(self, user_ids: list[int]):
        async def one(uid):
            try:
                r = await self.client.get(f"/users/{uid}")
                if r.status_code == 200:
                    return uid, r.json()
            except Exception:
                pass
            return uid, None

        results = await asyncio.gather(*(one(u) for u in user_ids))
        return {uid: data for uid, data in results if data}