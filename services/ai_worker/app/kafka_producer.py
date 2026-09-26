import json
import logging
from datetime import datetime, timezone
from aiokafka import AIOKafkaProducer
from .config import KAFKA_BOOTSTRAP_SERVERS

logger = logging.getLogger(__name__)


class UsageProducer:
    def __init__(self):
        self.producer: AIOKafkaProducer | None = None
        self.topic = "api.usage"

    async def start(self):
        self.producer = AIOKafkaProducer(
            bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
            value_serializer=lambda v: json.dumps(v).encode("utf-8"),
            acks="all",
            enable_idempotence=True,
        )
        await self.producer.start()

    async def emit(
        self,
        source: str,
        model: str,
        tokens_in: int = 0,
        tokens_out: int = 0,
        cost_usd: float = 0.0,
        correlation_id: str | None = None,
        user_id: int | None = None,
        success: bool = True,
        error: str | None = None,
    ):
        if not self.producer:
            return
        event = {
            "event_id": __import__("uuid").uuid4().hex,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "source": source,             # "ai_worker" / "image_worker"
            "model": model,
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
            "cost_usd": cost_usd,
            "correlation_id": correlation_id,
            "user_id": user_id,
            "success": success,
            "error": error,
        }
        try:
            await self.producer.send_and_wait(self.topic, event)
        except Exception:
            logger.exception("Failed to emit usage event")

    async def stop(self):
        if self.producer:
            await self.producer.stop()