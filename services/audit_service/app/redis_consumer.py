import asyncio
import json
import logging
import os
import socket
import redis.asyncio as redis

from .models import AuditEvent
from .crud import insert_event
from .config import AUDIT_STREAM_KEY, AUDIT_CONSUMER_GROUP, AUDIT_CONSUMER_NAME

logger = logging.getLogger(__name__)


BATCH_SIZE = 20
BLOCK_MS = 5000


class RedisAuditConsumer:

    def __init__(self):
        self.redis: redis.Redis | None = None
        self._task: asyncio.Task | None = None
        self._stopped = False

    async def start(self):
        self.redis = await redis.from_url(
            os.getenv("REDIS_URL", "redis://redis:6379"),
            decode_responses=True,
        )
        await self.redis.ping()

        try:
            await self.redis.xgroup_create(
                AUDIT_STREAM_KEY, AUDIT_CONSUMER_GROUP, id="0", mkstream=True
            )
            logger.info(f"[audit] consumer group {AUDIT_CONSUMER_GROUP} created")
        except redis.ResponseError as e:
            if "BUSYGROUP" not in str(e):
                raise

        self._task = asyncio.create_task(self._loop())
        logger.info(f"[audit] consumer {AUDIT_CONSUMER_NAME} listening on {AUDIT_STREAM_KEY}")

    async def _loop(self):
        while not self._stopped:
            try:
                response = await self.redis.xreadgroup(
                    AUDIT_CONSUMER_GROUP,
                    AUDIT_CONSUMER_NAME,
                    {AUDIT_STREAM_KEY: ">"},
                    count=BATCH_SIZE,
                    block=BLOCK_MS,
                )
                if not response:
                    continue

                for _stream_name, messages in response:
                    for msg_id, fields in messages:
                        await self._handle(msg_id, fields)

            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("[audit] read loop error")
                await asyncio.sleep(2)

    async def _handle(self, msg_id: str, fields: dict):
        raw = fields.get("event")
        if not raw:
            await self.redis.xack(AUDIT_STREAM_KEY, AUDIT_CONSUMER_GROUP, msg_id)
            return

        try:
            event_dict = json.loads(raw)
            event = AuditEvent(**event_dict)
            inserted = await insert_event(event)

            await self.redis.xack(AUDIT_STREAM_KEY, AUDIT_CONSUMER_GROUP, msg_id)

            if inserted:
                logger.info(
                    f"[audit] recorded {event.action} "
                    f"{event.entity_type}:{event.entity_id} by {event.actor_username}"
                )
        except Exception:
            logger.exception(f"[audit] failed to handle {msg_id}, will retry")
            await asyncio.sleep(1)

    async def stop(self):
        self._stopped = True
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        if self.redis:
            try:
                await self.redis.aclose()
            except Exception:
                pass
        logger.info("[audit] consumer stopped")