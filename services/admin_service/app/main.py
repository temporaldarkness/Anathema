import asyncio
from .kafka_consumer import AdminConsumer
import logging

logging.basicConfig(level=logging.INFO)

async def main():
    consumer = AdminConsumer()
    await consumer.start()
    print("Admin Service started")
    try:
        await asyncio.Future()
    finally:
        await consumer.stop()

if __name__ == "__main__":
    asyncio.run(main())