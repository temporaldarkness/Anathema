from aiokafka import AIOKafkaConsumer
import json
import asyncio
import logging
from .config import KAFKA_TOPIC_AI_RESPONSES, KAFKA_BOOTSTRAP_SERVERS, KAFKA_GROUP_GATEWAY, KAFKA_TOPIC_IMAGE_RESPONSES, KAFKA_TOPIC_ADMIN_RESPONSES, KAFKA_TOPIC_REACTION_COMMANDS

logger = logging.getLogger(__name__)

class AIResponseConsumer:
    def __init__(self, on_response_callback):
        self.consumer = None
        self.on_response = on_response_callback
    
    async def start(self):
        self.consumer = AIOKafkaConsumer(
            KAFKA_TOPIC_AI_RESPONSES,
            bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
            group_id=KAFKA_GROUP_GATEWAY,
            value_deserializer=lambda m: json.loads(m.decode('utf-8')),
            auto_offset_reset="earliest"
        )
        await self.consumer.start()
        asyncio.create_task(self.consume())
    
    async def consume(self):
        async for msg in self.consumer:
            data = msg.value
            correlation_id = data.get("correlation_id")
            response = data.get("response")
            mode = data.get("mode")
            if correlation_id and response:
                await self.on_response(correlation_id, response, mode)
    
    async def stop(self):
        if self.consumer:
            await self.consumer.stop()


class ImageResponseConsumer:
    def __init__(self, on_response_callback):
        self.consumer = None
        self.on_response = on_response_callback
    
    async def start(self):
        self.consumer = AIOKafkaConsumer(
            KAFKA_TOPIC_IMAGE_RESPONSES,
            bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
            group_id=KAFKA_GROUP_GATEWAY,
            value_deserializer=lambda m: json.loads(m.decode('utf-8')),
            auto_offset_reset="earliest"
        )
        await self.consumer.start()
        asyncio.create_task(self.consume())
    
    async def consume(self):
        logger.info(f"Starting to consume...")
        async for msg in self.consumer:
            logger.info(f"TOPIC: {msg.topic}, VALUE: {msg.value}")
            data = msg.value
            correlation_id = data.get("correlation_id")
            image_keys = data.get("image_keys", [])
            error = data.get("error")
            if correlation_id and (image_keys or error):
                await self.on_response(correlation_id, image_keys, error)
    
    async def stop(self):
        if self.consumer:
            await self.consumer.stop()


class AdminResponseConsumer:
    def __init__(self, on_response_callback):
        self.consumer = None
        self.on_response = on_response_callback
    
    async def start(self):
        self.consumer = AIOKafkaConsumer(
            KAFKA_TOPIC_ADMIN_RESPONSES,
            bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
            group_id=KAFKA_GROUP_GATEWAY,
            value_deserializer=lambda m: json.loads(m.decode('utf-8')),
            auto_offset_reset="earliest"
        )
        await self.consumer.start()
        asyncio.create_task(self.consume())
    
    async def consume(self):
        async for msg in self.consumer:
            data = msg.value
            correlation_id = data.get("correlation_id")
            result = data.get("result")
            error = data.get("error")
            logger.info(f"Received admin response {correlation_id} with {data=}")
            if correlation_id and (result or error):
                await self.on_response(correlation_id, result, error)
    
    async def stop(self):
        if self.consumer:
            await self.consumer.stop()


class ReactionCommandConsumer:
    def __init__(self, on_reaction_callback):
        self.consumer = None
        self.on_reaction = on_reaction_callback
    
    async def start(self):
        self.consumer = AIOKafkaConsumer(
            KAFKA_TOPIC_REACTION_COMMANDS,
            bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
            group_id=KAFKA_GROUP_GATEWAY,
            value_deserializer=lambda m: json.loads(m.decode('utf-8')),
            auto_offset_reset="earliest"
        )
        await self.consumer.start()
        asyncio.create_task(self.consume())
    
    async def consume(self):
        async for msg in self.consumer:
            cmd = msg.value
            if cmd.get("type") == "add_reaction":
                channel_id = cmd["channel_id"]
                message_id = cmd["message_id"]
                emoji = cmd["emoji"]
                await self.on_reaction(channel_id, message_id, emoji)
    
    async def stop(self):
        if self.consumer:
            await self.consumer.stop()
