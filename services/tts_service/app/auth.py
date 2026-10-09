from fastapi import Header, HTTPException
from .config import CALLER_KEYS


async def verify_api_key(x_api_key: str = Header(..., alias="X-API-Key")) -> str:
    for caller, key in CALLER_KEYS.items():
        if key and x_api_key == key:
            return caller
    raise HTTPException(401, "Invalid API key")