import os
from dotenv import load_dotenv

load_dotenv()

POSTGRES_USER = os.getenv("POSTGRES_USER", "bot")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "botpassword")
POSTGRES_DB = os.getenv("POSTGRES_DB", "radio_db")
POSTGRES_HOST = os.getenv("POSTGRES_HOST", "postgres")
POSTGRES_PORT = os.getenv("POSTGRES_PORT", "5432")
DATABASE_URL = (
    f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}"
    f"@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"
)

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379")
ICECAST_URL = os.getenv("ICECAST_URL")
ICECAST_SOURCE_PASSWORD = os.getenv("ICECAST_SOURCE_PASSWORD", "")

MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY")
MINIO_HOST = os.getenv("MINIO_HOST", "minio")
MINIO_PORT = os.getenv("MINIO_PORT", "9000")
MINIO_SECURE = os.getenv("MINIO_SECURE", "false").lower() == "true"
MINIO_RADIO_BUCKET = os.getenv("MINIO_RADIO_BUCKET", "radio-songs")
RADIO_QUEUE_KEY = os.getenv("RADIO_QUEUE_KEY", "radio:queue")

CACHE_DIR = os.getenv("RADIO_CACHE_DIR", "/var/cache/radio")

WEBWAY_RADIO_CLIENT_KEY = os.getenv("WEBWAY_RADIO_CLIENT_KEY")
CALLER_KEYS = {
    "webway": WEBWAY_RADIO_CLIENT_KEY,
}