import asyncio
import logging
from .memory_client import MemoryClient
from .reaction_checker import ReactionChecker
from .kafka_consumer import RawMessageConsumer
from .kafka_producer import ReactionCommandProducer

logging.basicConfig(
    level=logging.INFO,
    format = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)

memory = MemoryClient()
checker = ReactionChecker(memory)
producer = ReactionCommandProducer()

async def handle_message(data):
    message_id = data.get("message_id")
    channel_id = data.get("channel_id")
    user_id = data.get("user_id")
    content = data.get("content", "")
    username = data.get("username", "")
    
    user_uid = await memory.get_user_uid_by_discord_id(user_id)
    if not user_uid:
        return
    
    reactions = checker.check_message(content, user_uid)
    for emoji_source, emoji_uid in reactions:
        await producer.send_add_reaction(channel_id, int(message_id), emoji_source)

async def main():
    await memory.start()
    await producer.start()
    
    consumer = RawMessageConsumer(handle_message)
    await consumer.start()
    
    logger.info("Reaction Worker running...")
    try:
        await consumer.consume()
    finally:
        await consumer.stop()
        await producer.stop()
        await memory.close()

if __name__ == "__main__":
    asyncio.run(main())