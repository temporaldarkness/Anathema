import asyncio
import json
import logging
from aiokafka import AIOKafkaProducer
from .config import MEMORY_CACHE_TTL_SECONDS, KAFKA_BOOTSTRAP_SERVERS, KAFKA_TOPIC_CACHE_INVALIDATION

logger = logging.getLogger(__name__)

_producer: AIOKafkaProducer = None
_pending_events = asyncio.Queue()
_sender_task: asyncio.Task | None = None

async def _ensure_producer():
    global _producer
    if _producer is None:
        _producer = AIOKafkaProducer(
            bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
            value_serializer=lambda v: json.dumps(v).encode('utf-8'),
            max_request_size=1048576,
            retry_backoff_ms=100,
            request_timeout_ms=5000,
        )
        await _producer.start()
        logger.info("Kafka producer started")
    return _producer

async def _sender_worker():
    while True:
        try:
            event = await asyncio.wait_for(_pending_events.get(), timeout=1.0)
            producer = await _ensure_producer()
            await producer.send(KAFKA_TOPIC_CACHE_INVALIDATION, event)
            logger.debug(f"Sent invalidation event: {event}")
        except asyncio.TimeoutError:
            continue
        except Exception as e:
            logger.error(f"Failed to send event, will retry later: {e}")
            if 'event' in locals():
                await _pending_events.put(event)
            await asyncio.sleep(2)

async def publish_cache_invalidation(entity_type: str, operation: str, entity_id: int):
    event = {
        "entity_type": entity_type,
        "operation": operation,
        "entity_id": str(entity_id)
    }
    await _pending_events.put(event)
    
    global _sender_task
    if _sender_task is None or _sender_task.done():
        _sender_task = asyncio.create_task(_sender_worker())
        logger.info("Sender worker started")

async def close_producer():
    global _sender_task, _producer
    if _sender_task and not _sender_task.done():
        _sender_task.cancel()
        try:
            await _sender_task
        except asyncio.CancelledError:
            pass
        _sender_task = None
    if _producer:
        await _producer.stop()
        _producer = None
        logger.info("Kafka producer closed")