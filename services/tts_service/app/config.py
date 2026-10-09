import os
from dotenv import load_dotenv

load_dotenv()

PIPER_VOICES_DIR = os.getenv("PIPER_VOICES_DIR", "/app/voices")
CACHE_DIR = os.getenv("TTS_CACHE_DIR", "/var/cache/tts")
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379")
WEBWAY_TTS_CLIENT_KEY = os.getenv("WEBWAY_TTS_CLIENT_KEY")
RADIO_TTS_CLIENT_KEY = os.getenv("RADIO_TTS_CLIENT_KEY")

CALLER_KEYS = {
    "webway": WEBWAY_TTS_CLIENT_KEY,
    "radio_service": RADIO_TTS_CLIENT_KEY,
}

OUTPUT_AR = 44100
OUTPUT_AC = 2
OUTPUT_BITRATE = "128k"

TTS_CACHE_TTL_DAYS = 14
TTS_LENGTH_SCALE = 1.25
TTS_NOISE_SCALE = 0.8