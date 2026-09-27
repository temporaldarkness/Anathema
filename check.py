import os
import httpx

radio_url = os.environ.get("RADIO_SERVICE_URL", "NOT SET")
key = os.environ.get("WEBWAY_RADIO_CLIENT_KEY", "")

print(f"RADIO_SERVICE_URL = {radio_url}")
if key:
    print(f"WEBWAY_RADIO_CLIENT_KEY = {key[:8]}...{key[-4:]}")
else:
    print("WEBWAY_RADIO_CLIENT_KEY = EMPTY")

try:
    resp = httpx.get(
        f"{radio_url}/songs",
        params={"limit": 5},
        headers={"X-API-Key": key},
        timeout=10.0,
    )
    print(f"HTTP {resp.status_code}")
    print(resp.text[:800])
except Exception as e:
    print(f"ERROR: {type(e).__name__}: {e}")