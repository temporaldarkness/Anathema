import json
import logging
from aiokafka import AIOKafkaProducer
from .config import KAFKA_BOOTSTRAP_SERVERS

logger = logging.getLogger(__name__)

class ReactionCommandProducer:
    def __init__(self):
        self.producer = None
    
    async def start(self):
        self.producer = AIOKafkaProducer(
            bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
            value_serializer=lambda v: json.dumps(v).encode('utf-8'),
        )
        await self.producer.start()
        logger.info("Kafka producer started")
    
    async def send_add_reaction(self, channel_id: int, message_id: int, emoji_source: str):
        command = {
            "type": "add_reaction",
            "channel_id": channel_id,
            "message_id": message_id,
            "emoji": emoji_source
        }
        await self.producer.send("reaction.commands", command)
        logger.info(f"Sent add reaction: {command}")
    
    async def stop(self):
        if self.producer:
            await self.producer.stop()
            logger.info("Kafka producer closed")