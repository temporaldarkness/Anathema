from fastapi import FastAPI
import asyncio
from contextlib import asynccontextmanager
from .db import init_db, close_db
from .redis_client import close_redis
from .kafka_consumer import start_consumer, stop_consumer
from .api import router

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    asyncio.create_task(start_consumer())
    yield
    await stop_consumer()
    await close_db()
    await close_redis()

app = FastAPI(title="Anathema Message History Service", lifespan=lifespan)
app.include_router(router)

@app.get("/health")
async def health():
    return {"status": "ok"}