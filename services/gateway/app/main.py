import asyncio
import logging
from .bot import DiscordBot
from .config import DISCORD_TOKEN
from .memory_client import MemoryClient
from .storage_client import StorageClient
from .kafka_consumer import AIResponseConsumer, ImageResponseConsumer, AdminResponseConsumer, ReactionCommandConsumer
from .kafka_producer import KafkaProducer

logging.basicConfig(
    level=logging.INFO,
    format = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

async def main():
    memory = MemoryClient()
    storage = StorageClient()
    ai_response_consumer = AIResponseConsumer(on_response_callback=None)
    reaction_command_consumer = ReactionCommandConsumer(on_reaction_callback=None)
    image_response_consumer = ImageResponseConsumer(on_response_callback=None)
    admin_response_consumer = AdminResponseConsumer(on_response_callback=None)
    
    producer = KafkaProducer()
    bot = DiscordBot(
        memory,
        storage,
        ai_response_consumer, 
        reaction_command_consumer,
        image_response_consumer,
        admin_response_consumer,
        producer
    )
    
    ai_response_consumer.on_response = bot.on_ai_response
    reaction_command_consumer.on_reaction = bot.on_reaction_command
    image_response_consumer.on_response = bot.on_image_response
    admin_response_consumer.on_response = bot.on_admin_response
    
    async with bot:
        await bot.start(DISCORD_TOKEN)

if __name__ == "__main__":
    asyncio.run(main())