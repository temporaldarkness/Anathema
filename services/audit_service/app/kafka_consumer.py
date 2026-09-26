from .models import UsageEvent
from .crud_usage import insert_usage
from aiokafka import AIOKafkaConsumer
from .config import KAFKA_TOPIC_API_USAGE, KAFKA_GROUP_USAGE_CONSUMER, KAFKA_BOOTSTRAP_SERVERS
import asyncio


class UsageConsumer:
    def __init__(self):
        self.consumer = None
        self._task = None
        self._stopped = False

    async def start(self):
        self.consumer = AIOKafkaConsumer(
            KAFKA_TOPIC_API_USAGE,
            bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
            group_id=KAFKA_GROUP_USAGE_CONSUMER,
            value_deserializer=lambda m: json.loads(m.decode("utf-8")),
            auto_offset_reset="earliest",
            enable_auto_commit=False,
        )
        await self.consumer.start()
        self._task = asyncio.create_task(self._consume_loop())

    async def _consume_loop(self):
        try:
            async for msg in self.consumer:
                if self._stopped:
                    break
                try:
                    event = UsageEvent(**msg.value)
                except ValidationError as e:
                    logger.error(f"Invalid usage event: {e}")
                    await self.consumer.commit()
                    continue
                try:
                    inserted = await insert_usage(event)
                    if inserted:
                        logger.info(f"usage: {event.source} {event.model} ${event.cost_usd:.4f}")
                    await self.consumer.commit()
                except Exception:
                    logger.exception("Failed to insert usage, not committing")
                    await asyncio.sleep(2)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Usage consumer loop crashed")

    async def stop(self):
        self._stopped = True
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        if self.consumer:
            await self.consumer.stop()