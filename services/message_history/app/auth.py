from fastapi import Header, HTTPException, Depends
from .config import CALLER_KEYS

async def verify_api_key(x_api_key: str = Header(..., alias="X-API-Key")):
    for caller, key in CALLER_KEYS.items():
        if key and x_api_key == key:
            return caller
    raise HTTPException(status_code=401, detail="Invalid API key")