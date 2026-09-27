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
        text = data["candidates"][0]["content"]["parts"][-1]["text"]
        usage_meta = data.get("usageMetadata", {})
        return text, {
            "model": data.get("modelVersion") or "gemini-3.1-pro-preview",
            "tokens_in": usage_meta.get("promptTokenCount", 0),
            "tokens_out": usage_meta.get("candidatesTokenCount", 0),
        }

async def call_ai(instruction: str, user_message: str, model: str = None, temperature: float = 1.0, thinking: bool = False):
    try:
        if model == "Gemini":
            text, usage = await call_gemini(instruction, user_message, temperature, thinking)
        else:
            logger.warning(f"Model {model} unsupported, fallback to Gemini")
            text, usage = await call_gemini(instruction, user_message, temperature, thinking)
        return text, usage
    except Exception as e:
        return None, {"error": str(e), "model": model}