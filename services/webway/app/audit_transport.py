import asyncio
import json
import logging
import os
from pathlib import Path
import redis.asyncio as redis
from .config import AUDIT_FALLBACK_PATH, AUDIT_STREAM_KEY, AUDIT_STREAM_MAXLEN

logger = logging.getLogger(__name__)


class AuditTransport:

    def __init__(self):
        self.redis: redis.Redis | None = None
        self._flush_task: asyncio.Task | None = None
        self._stopped = False

    async def start(self):
        await self._try_connect()
        self._flush_task = asyncio.create_task(self._flush_loop())

    async def _try_connect(self):
        try:
            self.redis = await redis.from_url(
                os.getenv("REDIS_URL", "redis://redis:6379"),
                decode_responses=True,
            )
            await self.redis.ping()
            logger.info("[audit] connected to Redis")
        except Exception as e:
            self.redis = None
            logger.warning(f"[audit] Redis unavailable: {e}")

    async def send(self, event: dict):
        if self.redis is None:
            await self._try_connect()
            if self.redis is None:
                self._write_fallback(event)
                return

        try:
            await self.redis.xadd(
                AUDIT_STREAM_KEY,
                {"event": json.dumps(event, ensure_ascii=False)},
                maxlen=AUDIT_STREAM_MAXLEN,
                approximate=True,
            )
        except Exception as e:
            logger.warning(f"[audit] xadd failed: {e}")
            self.redis = None
            self._write_fallback(event)

    def _write_fallback(self, event: dict):
        try:
            with open(AUDIT_FALLBACK_PATH, "a", encoding="utf-8") as f:
                f.write(json.dumps(event, ensure_ascii=False) + "\n")
        except Exception as e:
            logger.error(f"[audit] fallback write failed: {e}")

    async def _flush_loop(self):
        while not self._stopped:
            await asyncio.sleep(30)
            await self._flush_fallback()

    async def _flush_fallback(self):
        path = Path(AUDIT_FALLBACK_PATH)
        if not path.exists():
            return
        if self.redis is None:
            await self._try_connect()
            if self.redis is None:
                return

        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except Exception:
            return

        if not lines:
            path.unlink(missing_ok=True)
            return

        remaining = []
        for line in lines:
            if not line.strip():
                continue
            try:
                await self.redis.xadd(
                    AUDIT_STREAM_KEY,
                    {"event": line},
                    maxlen=AUDIT_STREAM_MAXLEN,
                    approximate=True,
                )
            except Exception:
                remaining.append(line)

        if remaining:
            path.write_text("\n".join(remaining) + "\n", encoding="utf-8")
        else:
            path.unlink(missing_ok=True)
            logger.info("[audit] fallback flushed")

    async def stop(self):
        self._stopped = True
        if self._flush_task:
            self._flush_task.cancel()
            try:
                await self._flush_task
            except asyncio.CancelledError:
                pass
        if self.redis:
            try:
                await self.redis.aclose()
            except Exception:
                pass


audit_transport = AuditTransport()