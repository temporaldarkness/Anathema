import asyncio
import logging
import uvicorn
from contextlib import asynccontextmanager
from fastapi import FastAPI
from .db import init_db, close_db
from .redis_consumer import RedisAuditConsumer
from .api import router
from .middleware import AuthAndLogMiddleware
from .logging_config import setup_logging
from datetime import datetime, timezone

setup_logging()
logger = logging.getLogger(__name__)

BOOT_TIME = datetime.now(timezone.utc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    consumer = RedisAuditConsumer()
    await consumer.start()
    app.state.consumer = consumer
    logger.info("Audit Service started")
    yield
    await consumer.stop()
    await close_db()
    logger.info("Audit Service stopped")

app = FastAPI(title="Anathema Audit Service", lifespan=lifespan)
app.add_middleware(AuthAndLogMiddleware)
app.include_router(router)

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "uptime_seconds": int((datetime.now(timezone.utc) - BOOT_TIME).total_seconds()),
    }


async def run():
    config = uvicorn.Config(app, host="0.0.0.0", port=8006, log_config=None, access_log=False)
    server = uvicorn.Server(config)
    await server.serve()


if __name__ == "__main__":
    asyncio.run(run())