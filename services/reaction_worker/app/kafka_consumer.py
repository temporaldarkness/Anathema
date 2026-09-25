import json
import logging
from aiokafka import AIOKafkaConsumer
from .config import KAFKA_TOPIC_RAW_MESSAGES, KAFKA_BOOTSTRAP_SERVERS, KAFKA_GROUP_REACTION_WORKER, KAFKA_TOPIC_CACHE_INVALIDATION

logger = logging.getLogger(__name__)

class RawMessageConsumer:
    def __init__(self, callback):
        self.consumer = None
        self.callback = callback
    
    async def start(self):
        self.consumer = AIOKafkaConsumer(
            KAFKA_TOPIC_RAW_MESSAGES,
            bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
            group_id=KAFKA_GROUP_REACTION_WORKER,
            value_deserializer=lambda m: json.loads(m.decode('utf-8')),
            auto_offset_reset="earliest"
        )
        await self.consumer.start()
        logger.info("Kafka consumer started")

    async def consume(self):
        async for msg in self.consumer:
            await self.callback(msg.value)
    
    async def stop(self):
        if self.consumer:
            await self.consumer.stop()
            logger.info("Kafka consumer stopped")

class InvalidationConsumer:
    def __init__(self, on_invalidate):
        self.consumer = None
        self.on_invalidate = on_invalidate

    async def start(self):
        self.consumer = AIOKafkaConsumer(
            KAFKA_TOPIC_CACHE_INVALIDATION,
            bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
            group_id="reaction_worker_invalidation",
            value_deserializer=lambda m: json.loads(m.decode("utf-8")),
            auto_offset_reset="latest"
        )
        await self.consumer.start()

    async def consume(self):
        async for msg in self.consumer:
            await self.on_invalidate(msg.value)

    async def stop(self):
        if self.consumer:
            await self.consumer.stop()