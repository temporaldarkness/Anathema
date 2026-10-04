import httpx
import base64
import logging
from .config import PROXY_API_KEY

logger = logging.getLogger(__name__)

async def generate_image(prompt: str, n: int = 2, size: str = "auto", quality: str = "low"):
    payload = {
        "model": "gpt-image-2",
        "prompt": prompt,
        "n": n,
        "size": size,
        "quality": quality
    }
    async with httpx.AsyncClient(timeout=httpx.Timeout(600.0, connect=10.0)) as client:
        try:
            logger.info(f'Sending edit request: {size=} {n=}, {len(prompt)=}')
            resp = await client.post(
                f"https://api.proxyapi.ru/openai/v1/images/generations",
                json = payload,
                headers = {
                    "Authorization": f"Bearer {PROXY_API_KEY}",
                    "Content-Type": "application/json"
                }
            )
            logger.info(f"Response status: {resp.status_code}")
            if resp.status_code != 200:
                error_body = resp.text
                raise Exception(f"Expected status code 200, got {resp.status_code} instead ({error_body or 'Unknown Error'})")
        except Exception as e:
            logger.warning(f"Request failed {e}")
            raise
        data = resp.json()
        
        images = []
        for item in data["data"]:
            if "b64_json" in item:
                images.append(base64.b64decode(item["b64_json"]))
            elif "url" in item:
                image_resp = await client.get(item["url"])
                img_resp.raise_for_status()
                images.append(img_resp.content)
        return images
    
async def edit_image(prompt: str, images_bytes: list[bytes], n: int = 2, size: str = "auto", quality: str = "low"):
    
    data = {
        "model": "gpt-image-2",
        "prompt": prompt,
        "n": str(n),
        "size": size,
        "quality": quality,
    }
    files = {}
    for idx, img_bytes in enumerate(images_bytes):
        files[f"image[{idx}]"] = (f"ref_{idx}.png", img_bytes, "image/png")
    
    async with httpx.AsyncClient(timeout=httpx.Timeout(600.0, connect=10.0)) as client:
        try:
            logger.info(f'Sending edit request: {size=} {n=} {quality=}, {len(prompt)=}')
            resp = await client.post(
                f"https://api.proxyapi.ru/openai/v1/images/edits",
                data = data,
                files = files,
                headers = {
                    "Authorization": f"Bearer {PROXY_API_KEY}"
                }
            )
            logger.info(f"Response status: {resp.status_code}")
            if resp.status_code != 200:
                error_body = resp.text
                raise Exception(f"Expected status code 200, got {resp.status_code} instead ({error_body or 'Unknown Error'})")
        except Exception as e:
            logger.warning(f"Request failed {e}")
            raise
        data = resp.json()
        
        images = []
        for item in data["data"]:
            if "b64_json" in item:
                images.append(base64.b64decode(item["b64_json"]))
            elif "url" in item:
                image_resp = await client.get(item["url"])
                img_resp.raise_for_status()
                images.append(img_resp.content)
        return images