import os
from dotenv import load_dotenv

load_dotenv()

POSTGRES_USER = os.getenv("POSTGRES_USER", "anathema")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "")
AUDIT_DB = os.getenv("AUDIT_DB", "anathemaaudit")
POSTGRES_HOST = os.getenv("POSTGRES_HOST", "postgres")
POSTGRES_PORT = os.getenv("POSTGRES_PORT", "5432")

DATABASE_URL = (
    f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}"
    f"@{POSTGRES_HOST}:{POSTGRES_PORT}/{AUDIT_DB}"
)

KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
KAFKA_GROUP_AUDIT_SERVICE = os.getenv("KAFKA_GROUP_AUDIT_SERVICE", "audit_service_group")
KAFKA_TOPIC_AUDIT_EVENTS = os.getenv("KAFKA_TOPIC_AUDIT_EVENTS", "audit.events")

WEBWAY_AUDIT_CLIENT_KEY = os.getenv("WEBWAY_AUDIT_CLIENT_KEY")

CALLER_KEYS = {
    "webway": WEBWAY_AUDIT_CLIENT_KEY,
}

AUDIT_SERVICE_URL = os.getenv("AUDIT_SERVICE_URL", "http://audit_service:8006")


AUDIT_STREAM_KEY = os.getenv("AUDIT_STREAM_KEY")
AUDIT_CONSUMER_GROUP = os.getenv("AUDIT_CONSUMER_GROUP")
AUDIT_CONSUMER_NAME = os.getenv("AUDIT_CONSUMER_NAME")