from aiokafka import AIOKafkaProducer
import json
import logging
from .config import KAFKA_BOOTSTRAP_SERVERS, KAFKA_TOPIC_AI_REQUESTS, KAFKA_TOPIC_IMAGE_REQUESTS, KAFKA_TOPIC_ADMIN_COMMANDS, KAFKA_TOPIC_RAW_MESSAGES

logger = logging.getLogger(__name__)

class KafkaProducer:
    def __init__(self):
        self.producer = None
    
    async def start(self):
        self.producer = AIOKafkaProducer(
            bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
            value_serializer=lambda v: json.dumps(v).encode('utf-8')
        )
        await self.producer.start()
    
    async def send_ai_request(self, correlation_id, channel_id, user_id, content, ltm, user_data, channel_data, settings, mode="chat"):
        task = {
            "correlation_id": correlation_id,
            "channel_id": channel_id,
            "user_id": user_id,
            "content": content,
            "ltm": ltm,
            "user_data": user_data,
            "channel_data": channel_data,
            "settings": settings,
            "mode": mode
        }
        await self.producer.send(KAFKA_TOPIC_AI_REQUESTS, task)
        logger.debug(f"Sent AI request {correlation_id} with mode {mode}")
    
    async def send_image_request(self, correlation_id, command, prompt, image_file_ids: list[str] = [], 
        n=2, quality="low", size="auto", user_id= None):
        task = {
            "correlation_id": correlation_id,
            "command": command,
            "prompt": prompt,
            "image_file_ids": image_file_ids,
            "n": n,
            "quality": quality,
            "size": size,
            "user_id": user_id
        }
        await self.producer.send(KAFKA_TOPIC_IMAGE_REQUESTS, task)
        logger.debug(f"Sent image {command} request {correlation_id}")
    
    async def send_admin_command(self, correlation_id, command, data, user_id, guild_id, channel_id):
        task = {
            "correlation_id": correlation_id,
            "command": command,
            "data": data,
            "user_id": user_id,
            "guild_id": guild_id,
            "channel_id": channel_id
        }
        await self.producer.send(KAFKA_TOPIC_ADMIN_COMMANDS, task)
        logger.debug(f"Sent admin command {command}")
    
    async def send_raw_message(self, message_id, channel_id, user_id, username, content, 
        timestamp, reply_to_message_id=None, attachments=None):
        attachments = attachments or []
        
        raw_message = {
            "message_id": message_id,
            "channel_id": channel_id,
            "user_id": user_id,
            "username": username,
            "content": content,
            "timestamp": timestamp,
            "reply_to_message_id": reply_to_message_id,
            "attachments": attachments
        }
        await self.producer.send(KAFKA_TOPIC_RAW_MESSAGES, raw_message)
        logger.debug(f"Sent raw message {message_id}")
    
    async def stop(self):
        if self.producer:
            await self.producer.stop()
        