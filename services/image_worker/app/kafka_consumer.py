import json
import logging
from aiokafka import AIOKafkaConsumer
from .config import KAFKA_TOPIC_IMAGE_REQUESTS, KAFKA_GROUP_IMAGE_WORKER, KAFKA_BOOTSTRAP_SERVERS

logger = logging.getLogger(__name__)

class ImageRequestConsumer:
    def __init__(self, callback):
        self.consumer = None
        self.callback = callback
    
    async def start(self):
        self.consumer = AIOKafkaConsumer(
            KAFKA_TOPIC_IMAGE_REQUESTS,
            bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
            group_id=KAFKA_GROUP_IMAGE_WORKER,
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