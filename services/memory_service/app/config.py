import os
from dotenv import load_dotenv

load_dotenv()

POSTGRES_USER = os.getenv("POSTGRES_USER")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD")
POSTGRES_DB = os.getenv("POSTGRES_DB")
POSTGRES_HOST = os.getenv("POSTGRES_HOST")
POSTGRES_PORT = os.getenv("POSTGRES_PORT")

KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS")

KAFKA_TOPIC_CACHE_INVALIDATION = os.getenv("KAFKA_TOPIC_CACHE_INVALIDATION")

MEMORY_CACHE_TTL_SECONDS = os.getenv("MEMORY_CACHE_TTL_SECONDS")


REDIS_URL = os.getenv("REDIS_URL")

DEFAULT_SETTINGS = {
    "model": "Gemini",
    "puppeteer": "true",
    "thinking": "true",
    "channel_caching": "true",
    "longterm": "true",
    "images": "false"
}