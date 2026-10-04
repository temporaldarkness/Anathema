import asyncio
from .kafka_consumer import AdminConsumer
import logging
from .heartbeat import heartbeat_loop

logging.basicConfig(level=logging.INFO)

async def main():
    consumer = AdminConsumer()
    await consumer.start()
    hb_task = asyncio.create_task(heartbeat_loop("admin_service"))
    print("Admin Service started")
    try:
        await asyncio.Future()
    finally:
        hb_task.cancel()
        try:
            await hb_task
        except asyncio.CancelledError:
            pass
        await consumer.stop()

if __name__ == "__main__":
    asyncio.run(main())