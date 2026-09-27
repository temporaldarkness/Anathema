import asyncio
import logging
import uvicorn
from contextlib import asynccontextmanager
from fastapi import FastAPI
from datetime import datetime, timezone

from .db import init_db, close_db
from .redis_client import close_redis
from .player import player_loop, skip_command_listener, player
from .api import router
from .middleware import AuthAndLogMiddleware
from .logging_config import setup_logging

setup_logging()
logger = logging.getLogger(__name__)

BOOT_TIME = datetime.now(timezone.utc)

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    player_task = asyncio.create_task(player_loop(), name="radio_player")
    skip_task = asyncio.create_task(skip_command_listener(), name="radio_skip_listener")

    def _task_done(t: asyncio.Task):
        if t.cancelled():
            return
        exc = t.exception()
        if exc is not None:
            logger.error(f"task {t.get_name()} died: {exc!r}", exc_info=exc)

    player_task.add_done_callback(_task_done)
    skip_task.add_done_callback(_task_done)

    logger.info("Radio Service started")
    try:
        yield
    finally:
        for t in (player_task, skip_task):
            t.cancel()
            try:
                await t
            except asyncio.CancelledError:
                pass
        await player.shutdown()
        await close_db()
        await close_redis()
        logger.info("Radio Service stopped")


app = FastAPI(title="Anathema Radio Service", lifespan=lifespan)
app.add_middleware(AuthAndLogMiddleware)
app.include_router(router)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "uptime_seconds": int((datetime.now(timezone.utc) - BOOT_TIME).total_seconds()),
    }


async def run():
    config = uvicorn.Config(app, host="0.0.0.0", port=8007, log_config=None, access_log=False)
    server = uvicorn.Server(config)
    await server.serve()


if __name__ == "__main__":
    asyncio.run(run())