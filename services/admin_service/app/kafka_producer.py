import json
import logging
from aiokafka import AIOKafkaProducer
from .config import KAFKA_BOOTSTRAP_SERVERS, KAFKA_TOPIC_ADMIN_RESPONSES

logger = logging.getLogger(__name__)

class AdminResponseProducer:
    def __init__(self):
        self.producer = None
    
    async def start(self):
        self.producer = AIOKafkaProducer(
            bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
            value_serializer=lambda v: json.dumps(v).encode('utf-8'),
        )
        await self.producer.start()
        logger.info("Kafka producer started")
    
    async def send_response(self, correlation_id: int, result: dict = None, error: str = None):
        response = {
            "correlation_id": correlation_id,
            "result": result,
            "error": error
        }
        await self.producer.send(KAFKA_TOPIC_ADMIN_RESPONSES, response)
        logger.info(f"Sent response: {correlation_id}")
    
    async def stop(self):
        if self.producer:
            await self.producer.stop()
            logger.info("Kafka producer closed")