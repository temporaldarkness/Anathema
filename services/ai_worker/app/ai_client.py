import httpx
import logging
from .config import PROXY_API_KEY
from .exceptions import InsufficientFundsError

logger = logging.getLogger(__name__)

async def call_gemini(instruction: str, user_message: str, temperature: float = 1.0, thinking: bool = False):
    payload = {
        "system_instruction": {
            "parts": [{"text": instruction}]
        },
        "contents": [
            {
                "role": "user",
                "parts": [{"text": user_message}]
            }
        ],
        "generationConfig": {
            "temperature": temperature,
        }
    }
    if thinking:
        payload["generationConfig"]["thinkingConfig"] = {"includeThoughts": True}
    
    headers = {
        "Authorization": f"Bearer {PROXY_API_KEY}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://api.proxyapi.ru/google/v1beta/models/gemini-3.1-pro-preview:generateContent",  
            json=payload,
            headers=headers,
            timeout=300.0
        )
        if resp.status_code == 402:
            logger.warning(f"Insufficient funds for Gemini API")
            raise InsufficientFundsError("Insufficient funds on balance, service unavailable")
        if resp.status_code != 200:
            logger.error(f"Gemini API error: {resp.status_code} - {resp.text}")
            resp.raise_for_status()
        data = resp.json()
        return data["candidates"][0]["content"]["parts"][-1]["text"]

async def call_ai(instruction: str, user_message: str, model: str = None, temperature: float = 1.0, thinking: bool = False):
    if model == "Gemini":
        return await call_gemini(instruction, user_message, temperature, thinking)
    else:
        logger.warning(f"Model {model} unsupported, fallback to Gemini")
        return await call_gemini(instruction, user_message, temperature, thinking)