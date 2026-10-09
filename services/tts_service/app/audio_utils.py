import asyncio
from .config import OUTPUT_AR, OUTPUT_AC, OUTPUT_BITRATE


async def normalize_wav_to_mp3(wav_path: str) -> bytes:
    proc = await asyncio.create_subprocess_exec(
        "ffmpeg",
        "-hide_banner", "-loglevel", "error",
        "-i", wav_path,
        "-ar", str(OUTPUT_AR),
        "-ac", str(OUTPUT_AC),
        "-b:a", OUTPUT_BITRATE,
        "-write_xing", "0",
        "-write_id3v2", "0",
        "-id3v2_version", "0",
        "-map_metadata", "-1",
        "-f", "mp3",
        "-",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {stderr.decode()[:300]}")
    return stdout