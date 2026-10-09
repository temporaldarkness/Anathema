import asyncio
import json
import os
import logging
from datetime import datetime, timezone
from pathlib import Path

from .config import ICECAST_URL, CACHE_DIR
from .redis_client import get_redis
from .storage import download_song
from .crud import (
    pick_random_song, log_history_start, log_history_end,
    bump_play_count, get_song
)
from .crud_settings import get_settings
from .queue import pop_next_song_id
from .tts_client import fetch_announce, fetch_greeting, pick_voice, close_client

logger = logging.getLogger(__name__)

Path(CACHE_DIR).mkdir(parents=True, exist_ok=True)

CHUNK_SIZE = 4 * 1024


class ContinuousPlayer:
    def __init__(self):
        self.ffmpeg: asyncio.subprocess.Process | None = None
        self.stdin: asyncio.StreamWriter | None = None
        self.current_song: dict | None = None
        self.current_history_id: int | None = None
        self.current_started_at: datetime | None = None
        self.skip_requested: bool = False
        self.skip_by: int | None = None
        self.skip_by_username: str | None = None
        self.stopping: bool = False
        self.next_song: dict | None = None
        self.last_greeting_at: datetime | None = None

    async def start_ffmpeg(self):
        """Запускает долгоживущий ffmpeg → Icecast."""
        if self.ffmpeg is not None and self.ffmpeg.returncode is None:
            return

        logger.info("Starting persistent ffmpeg → Icecast")
        self.ffmpeg = await asyncio.create_subprocess_exec(
            "ffmpeg",
            "-hide_banner", "-loglevel", "warning",
            "-re",
            "-f", "mp3",
            "-i", "pipe:0",
            "-c", "copy",
            "-f", "mp3",
            "-content_type", "audio/mpeg",
            ICECAST_URL,
            stdin=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        self.stdin = self.ffmpeg.stdin
        asyncio.create_task(self._drain_stderr())

    async def _drain_stderr(self):
        if not self.ffmpeg or not self.ffmpeg.stderr:
            return
        try:
            while True:
                line = await self.ffmpeg.stderr.readline()
                if not line:
                    break
                text = line.decode(errors="ignore").strip()
                if text:
                    logger.debug(f"[ffmpeg] {text}")
        except Exception:
            pass

    async def stop_ffmpeg(self):
        if self.ffmpeg is None:
            return
        try:
            if self.stdin:
                try:
                    self.stdin.close()
                    await self.stdin.wait_closed()
                except Exception:
                    pass
            self.ffmpeg.terminate()
            try:
                await asyncio.wait_for(self.ffmpeg.wait(), timeout=1.5)
            except asyncio.TimeoutError:
                self.ffmpeg.kill()
                await self.ffmpeg.wait()
        except Exception:
            logger.exception("error stopping ffmpeg")
        finally:
            self.ffmpeg = None
            self.stdin = None

    async def _ensure_cached(self, song: dict) -> str:
        path = os.path.join(CACHE_DIR, f"{song['storage_file_id']}.mp3")
        if os.path.exists(path) and os.path.getsize(path) > 0:
            return path
        logger.info(f"Downloading {song['title']} from MinIO...")
        data = await download_song(song["storage_file_id"])
        tmp = path + ".part"
        with open(tmp, "wb") as f:
            f.write(data)
        os.replace(tmp, path)
        return path

    async def _publish_now_playing(self, song: dict, started_at: datetime, status: str = "playing"):
        try:
            r = await get_redis()
            ends_at = None
            if song.get("duration_sec"):
                ends_at = datetime.fromtimestamp(
                    started_at.timestamp() + float(song["duration_sec"]), tz=timezone.utc
                ).isoformat()
            await r.set("radio:now_playing", json.dumps({
                "status": status,
                "song_id": song["id"],
                "title": song["title"],
                "artist": song["artist"] or "",
                "started_at": started_at.isoformat(),
                "ends_at": ends_at,
                "duration_sec": song.get("duration_sec"),
            }))
        except Exception as e:
            logger.warning(f"failed to publish now_playing: {e}")
    
    async def _finalize_skipped(self, song: dict):
        logger.info(f"skipped before playing: {song['title']}")
        skipped = self.skip_requested
        self.skip_requested = False
        self.skip_by = None
        self.skip_by_username = None
        return skipped, 0.0

    async def _clear_now_playing(self):
        try:
            r = await get_redis()
            await r.set("radio:now_playing", json.dumps({"status": "idle"}))
        except Exception:
            pass

    async def _play_song(self, song: dict) -> tuple[bool, float]:
        if self.ffmpeg is None or self.ffmpeg.returncode is not None:
            await self.start_ffmpeg()
            
        self.skip_requested = False
        self.skip_by = None
        self.skip_by_username = None
        
        settings = await get_settings()
        
        play_greeting = False
        if settings.get("greeting_enabled"):
            if self.last_greeting_at is None:
                play_greeting = True
            else:
                delta_min = (datetime.now(timezone.utc) - self.last_greeting_at).total_seconds() / 60
                if delta_min >= settings.get("greeting_interval_minutes", 30):
                    play_greeting = True
        
        announce_bytes = None
        if settings.get("announcements_enabled"):
            voice = pick_voice(settings.get("announcement_voices") or ["dmitri"])
            announce_bytes = await fetch_announce(song, voice)
        
        if announce_bytes or play_greeting:
            await self._publish_announcing(song)
        
        if play_greeting:
            voice = pick_voice(settings.get("announcement_voices") or ["dmitri"])
            greeting_bytes = await fetch_greeting(voice)
            if greeting_bytes:
                logger.info("▶ greeting")
                await self._stream_bytes(greeting_bytes)
                self.last_greeting_at = datetime.now(timezone.utc)
            else:
                self.last_greeting_at = datetime.now(timezone.utc)
        
        if announce_bytes:
            logger.info(f"▶ announce → {song['title']}")
            await self._stream_bytes(announce_bytes)
            if self.skip_requested or self.stopping:
                return await self._finalize_skipped(song)

        path = await self._ensure_cached(song)
        started_at = datetime.now(timezone.utc)
        self.current_song = song
        self.current_started_at = started_at
        self.skip_requested = False
        self.skip_by = None
        self.skip_by_username = None

        await self._publish_now_playing(song, started_at, "playing")
        self.current_history_id = await log_history_start(song, started_at)
        logger.info(f"▶ {song['title']} — {song.get('artist') or ''}")

        killed_for_skip = False

        try:
            with open(path, "rb") as f:
                while True:
                    if self.skip_requested or self.stopping:
                        killed_for_skip = True
                        await self.stop_ffmpeg()
                        break

                    if self.ffmpeg is None or self.ffmpeg.returncode is not None:
                        logger.warning("ffmpeg died, restarting...")
                        await self.start_ffmpeg()
                        f.seek(0)
                        continue

                    chunk = f.read(CHUNK_SIZE)
                    if not chunk:
                        break
                    try:
                        self.stdin.write(chunk)
                        await self.stdin.drain()
                    except (BrokenPipeError, ConnectionResetError):
                        logger.warning("broken pipe to ffmpeg, restarting")
                        await self.start_ffmpeg()
                        f.seek(0)
                        continue
        except Exception:
            logger.exception("error writing song to ffmpeg")
            raise
        finally:
            ended_at = datetime.now(timezone.utc)
            played = (ended_at - started_at).total_seconds()
            skipped = self.skip_requested
            try:
                await log_history_end(
                    self.current_history_id, ended_at, skipped,
                    self.skip_by, self.skip_by_username, played,
                )
                if not skipped:
                    await bump_play_count(song["id"])
            except Exception:
                logger.exception("failed to log history end")
            self.current_song = None
            self.current_history_id = None
            self.current_started_at = None
            
        if killed_for_skip and not self.stopping:
            await asyncio.sleep(1.5)
            await self.start_ffmpeg()

        return self.skip_requested, played
    
    async def _pick_next(self) -> dict | None:
        queued_id = await pop_next_song_id()
        while queued_id is not None:
            song = await get_song(queued_id)
            if song:
                song["_from_queue"] = True
                return song
            queued_id = await pop_next_song_id()

        song = await pick_random_song(exclude_ids=[])
        if song:
            song["_from_queue"] = False
        return song


    async def _publish_next(self, song: dict | None):
        r = await get_redis()
        if not song:
            await r.delete("radio:next")
            return
        await r.set("radio:next", json.dumps({
            "song_id": song["id"],
            "title": song["title"],
            "artist": song.get("artist") or "",
            "duration_sec": song.get("duration_sec"),
            "from_queue": song.get("_from_queue", False),
        }))


    async def refresh_next(self):
        self.next_song = await self._pick_next()
        await self._publish_next(self.next_song)

    async def run(self):
        logger.info("Radio player loop starting...")
        await asyncio.sleep(2)
        await self.start_ffmpeg()
        await self.refresh_next()

        while not self.stopping:
            try:
                song = self.next_song
                if song is None:
                    await self.refresh_next()
                    song = self.next_song

                if song is None:
                    logger.warning("No songs in library, waiting...")
                    await self._clear_now_playing()
                    await self._publish_next(None)
                    await asyncio.sleep(15)
                    continue

                self.next_song = None
                await self.refresh_next()

                await self._play_song(song)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("player iteration error")
                await asyncio.sleep(5)

    async def skip(self, by: int | None, by_username: str | None):
        if self.current_song is None or self.skip_requested:
            return
        self.skip_requested = True
        self.skip_by = by
        self.skip_by_username = by_username
        logger.info(f"Skip requested by {by_username}")

    async def shutdown(self):
        self.stopping = True
        await self.stop_ffmpeg()
        await close_client()
    
    async def _stream_bytes(self, data: bytes):
        pos = 0
        while pos < len(data):
            if self.skip_requested or self.stopping:
                return
            if self.ffmpeg is None or self.ffmpeg.returncode is not None:
                await self.start_ffmpeg()
                pos = 0
                continue
            chunk = data[pos:pos + CHUNK_SIZE]
            try:
                self.stdin.write(chunk)
                await self.stdin.drain()
            except (BrokenPipeError, ConnectionResetError):
                await self.start_ffmpeg()
                pos = 0
                continue
            pos += len(chunk)
    
    async def _publish_announcing(self, song: dict):
        try:
            r = await get_redis()
            await r.set("radio:now_playing", json.dumps({
                "status": "announcing",
                "song_id": song["id"],
                "title": song["title"],
                "artist": song.get("artist") or "",
                "started_at": None,
                "ends_at": None,
                "duration_sec": song.get("duration_sec"),
            }))
        except Exception:
            pass


player = ContinuousPlayer()


async def player_loop():
    try:
        await player.run()
    except asyncio.CancelledError:
        raise
    except Exception:
        logger.exception("player_loop crashed")
        raise


async def skip_command_listener():
    r = await get_redis()
    pubsub = r.pubsub()
    await pubsub.subscribe("radio:commands")
    logger.info("Skip command listener started")
    try:
        async for message in pubsub.listen():
            if message["type"] != "message":
                continue
            try:
                data = json.loads(message["data"])
            except Exception:
                continue
            if data.get("cmd") == "skip":
                await player.skip(data.get("by"), data.get("by_username"))
    finally:
        await pubsub.unsubscribe("radio:commands")


async def request_skip(by: int | None, by_username: str | None):
    r = await get_redis()
    await r.publish("radio:commands", json.dumps({
        "cmd": "skip", "by": by, "by_username": by_username,
    }))