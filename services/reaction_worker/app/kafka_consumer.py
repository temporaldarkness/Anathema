import json
import logging
from aiokafka import AIOKafkaConsumer
from .config import KAFKA_TOPIC_RAW_MESSAGES, KAFKA_BOOTSTRAP_SERVERS, KAFKA_GROUP_REACTION_WORKER

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