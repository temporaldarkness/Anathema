import asyncio
import os
import tempfile


async def probe_duration_seconds(data: bytes) -> float | None:
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
        f.write(data)
        path = f.name
    try:
        proc = await asyncio.create_subprocess_exec(
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await proc.communicate()
        try:
            return float(stdout.decode().strip())
        except Exception:
            return None
    finally:
        try:
            os.unlink(path)
        except Exception:
            pass