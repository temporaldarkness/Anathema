import time
import logging
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi import Request
from fastapi.responses import JSONResponse
from .config import CALLER_KEYS

logger = logging.getLogger(__name__)


class AuthAndLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Health — без авторизации (для compose healthcheck)
        if request.url.path == "/health":
            return await call_next(request)

        api_key = request.headers.get("X-API-Key")
        caller = None
        for name, key in CALLER_KEYS.items():
            if key and api_key == key:
                caller = name
                break

        if caller is None:
            logger.warning(
                "unauthorized request",
                extra={
                    "path": request.url.path,
                    "method": request.method,
                    "client": request.client.host if request.client else "?",
                },
            )
            return JSONResponse(status_code=401, content={"detail": "Invalid API key"})

        request.state.caller = caller

        start = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            logger.exception(f"unhandled error by {caller} on {request.url.path}")
            raise
        duration_ms = (time.perf_counter() - start) * 1000

        logger.info(
            "request",
            extra={
                "caller": caller,
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "duration_ms": round(duration_ms, 2),
            },
        )
        return response