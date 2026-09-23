import json
import asyncio
import httpx
from aiokafka import AIOKafkaConsumer
from .memory_client import MemoryClient
from .security_client import SecurityClient
from .kafka_producer import AdminResponseProducer
from .handlers import handle_maintenance, handle_channel
from .config import KAFKA_BOOTSTRAP_SERVERS, KAFKA_GROUP_ADMIN_SERVICE, KAFKA_TOPIC_ADMIN_COMMANDS

class AdminConsumer:
    def __init__(self):
        self.consumer = None
        self.memory = MemoryClient()
        self.security = SecurityClient()
        self.producer = AdminResponseProducer()

    async def start(self):
        self.consumer = AIOKafkaConsumer(
            KAFKA_TOPIC_ADMIN_COMMANDS,
            bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
            group_id=KAFKA_GROUP_ADMIN_SERVICE,
            value_deserializer=lambda m: json.loads(m.decode('utf-8')),
            auto_offset_reset="earliest"
        )
        await self.consumer.start()
        await self.producer.start()
        asyncio.create_task(self._consume())

    async def _consume(self):
        async for msg in self.consumer:
            data = msg.value
            corr_id = data.get("correlation_id")
            command = data.get("command")
            args = data.get("data", {})
            user_id = data.get("user_id")
            guild_id = data.get("guild_id")
            channel_id = data.get("channel_id")
            
            user_uid = await self._get_user_uid(user_id)

            allowed = await self.security.check_permission(guild_id, user_id, user_uid, "admin")
            if not allowed:
                await self.producer.send_response(corr_id, error="Insufficient permissions")
                continue

            try:
                if command == "maintenance":
                    result = await handle_maintenance(self.memory, args, channel_id)
                elif command == "channel":
                    result = await handle_channel(self.memory, args, channel_id)
                else:
                    result = {"error": f"Unknown command: {command}"}
            except Exception as e:
                result = {"error": str(e)}

            await self.producer.send_response(corr_id, result=result)

    async def _get_user_uid(self, user_id: int) -> str:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{self.memory.client.base_url}/users/by_discord_id/{user_id}")
            if resp.status_code == 200:
                user = resp.json()
                return user.get("uid", "")
        return ""

    async def stop(self):
        await self.consumer.stop()
        await self.producer.stop()
        await self.memory.close()
        await self.security.close()