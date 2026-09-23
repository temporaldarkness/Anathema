import os
from dotenv import load_dotenv

load_dotenv()

DISCORD_TOKEN = os.getenv("DISCORD_TOKEN")

SUPERUSER_ID = os.getenv("SUPERUSER_ID")

REDIS_URL = os.getenv("REDIS_URL")