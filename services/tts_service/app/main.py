import asyncio
import logging
import uvicorn
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from fastapi import FastAPI

from .api import router
from .middleware import AuthAndLogMiddleware
from .logging_config import setup_logging
from .heartbeat import heartbeat_loop

setup_logging()
logger = logging.getLogger(__name__)

BOOT_TIME = datetime.now(timezone.utc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    hb_task = asyncio.create_task(heartbeat_loop("tts_service"))
    logger.info("TTS Service started")
    try:
        yield
    finally:
        hb_task.cancel()
        try:
            await hb_task
        except asyncio.CancelledError:
            pass
        logger.info("TTS Service stopped")


app = FastAPI(title="Anathema TTS Service", lifespan=lifespan)
app.add_middleware(AuthAndLogMiddleware)
app.include_router(router)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "uptime_seconds": int((datetime.now(timezone.utc) - BOOT_TIME).total_seconds()),
    }


async def run():
    config = uvicorn.Config(app, host="0.0.0.0", port=8008, log_config=None, access_log=False)
    server = uvicorn.Server(config)
    await server.serve()


if __name__ == "__main__":
    asyncio.run(run())