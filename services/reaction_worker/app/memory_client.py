import httpx
import asyncio
import logging
from .config import MEMORY_SERVICE_URL, REACTIONWORKER_MEMORY_CLIENT_KEY

logger = logging.getLogger(__name__)

class MemoryClient:
    def __init__(self):
        self.client = httpx.AsyncClient(
            timeout=10.0, 
            base_url=MEMORY_SERVICE_URL,
            headers={"X-API-Key": REACTIONWORKER_MEMORY_CLIENT_KEY}
        )
        self.keywords = []
        self.user_reactions = []
        self.emotes = {}
        self.update_interval = 60
        self._update_task = None
        self.users_by_discord = {}
    
    async def fetch_keywords(self):
        resp = await self.client.get("/keywords")
        resp.raise_for_status()
        data = resp.json()
        self.keywords = [(item['keyword'], item['emoji_uid']) for item in data]
    
    async def fetch_user_reactions(self):
        resp = await self.client.get("/user_reactions")
        resp.raise_for_status()
        data = resp.json()
        self.user_reactions = [(item['user_uid'], item['emoji_uid']) for item in data]

    async def fetch_emotes(self):
        resp = await self.client.get("/emotes")
        resp.raise_for_status()
        data = resp.json()
        self.emotes = {item['uid']: item['source'] for item in data}
    
    async def update_cache(self):
        await self.fetch_keywords()
        await self.fetch_user_reactions()
        await self.fetch_emotes()
        
        logger.info(f"Cache updated: {len(self.keywords)} keywords, {len(self.user_reactions)} user reactions")
    
    async def periodic_update(self):
        while True:
            await asyncio.sleep(self.update_interval)
            await self.update_cache()
            self.users_by_discord = {}
    
    async def start(self):
        await self.update_cache()
        self._update_task = asyncio.create_task(self.periodic_update())
    
    async def close(self):
        if self._update_task:
            self._update_task.cancel()
        await self.client.aclose()
    
    def get_emoji_source(self, emoji_uid):
        return self.emotes.get(emoji_uid)
    
    async def get_user_uid_by_discord_id(self, discord_id: int) -> str | None:
        if discord_id in self.users_by_discord:
            return self.users_by_discord[discord_id]

        resp = await self.client.get(f"/users/discord/{discord_id}")
        if resp.status_code == 404:
            self.users_by_discord[discord_id] = None
            return None
        resp.raise_for_status()
        user = resp.json()
        uid = user.get("uid")
        self.users_by_discord[discord_id] = uid
        return uid