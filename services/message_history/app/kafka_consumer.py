import json
import logging
from aiokafka import AIOKafkaConsumer
from .models import Message
from .crud import save_message
import asyncio
from .config import KAFKA_BOOTSTRAP_SERVERS, KAFKA_GROUP_MESSAGE_HISTORY, KAFKA_TOPIC_RAW_MESSAGES

logger = logging.getLogger(__name__)

_consumer: AIOKafkaConsumer = None

async def start_consumer():
    global _consumer
    _consumer = AIOKafkaConsumer(
        KAFKA_TOPIC_RAW_MESSAGES,
        bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
        group_id=KAFKA_GROUP_MESSAGE_HISTORY,
        value_deserializer=lambda m: json.loads(m.decode('utf-8')),
        auto_offset_reset="earliest"
    )
    await _consumer.start()
    logger.info("Kafka consumer started")
    try:
        async for msg in _consumer:
            data = msg.value
            try:
                message = Message(
                    message_id=data["message_id"],
                    channel_id=data["channel_id"],
                    user_id=data["user_id"],
                    username=data["username"],
                    content=data["content"],
                    timestamp=data["timestamp"],
                    
                    reply_to_message_id=data.get("reply_to_message_id"),
                    attachments=data.get("attachments", [])
                )
                await save_message(message)
                logger.info(f"Saved message {message.message_id} from channel {message.channel_id}")
            except Exception as e:
                logger.warning(f"Failed to process message: {e}")
    finally:
        await stop_consumer()

async def stop_consumer():
    global _consumer
    if _consumer:
        await _consumer.stop()
        _consumer = None
        logger.info("Kafka consumer stopped")