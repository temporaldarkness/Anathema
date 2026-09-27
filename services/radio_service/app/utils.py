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

async def normalize_mp3(data: bytes) -> bytes:
    proc = await asyncio.create_subprocess_exec(
        "ffmpeg",
        "-hide_banner", "-loglevel", "error",
        "-i", "pipe:0",
        "-vn",
        "-ar", "44100",
        "-ac", "2",
        "-b:a", "128k",
        "-write_xing", "0",
        "-write_id3v2", "0",
        "-id3v2_version", "0",
        "-map_metadata", "-1",
        "-f", "mp3",
        "-",
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate(data)
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {stderr.decode(errors='ignore')[:300]}")
    return stdout