import asyncio
import json
import logging
import discord
from discord.ext import commands
from .config import RADIO_VOICE_ENABLED, VOICE_CHANNEL_ID, RADIO_STREAM_URL, REDIS_URL
import redis.asyncio as redis

logger = logging.getLogger(__name__)

_redis = None
async def get_redis():
    global _redis
    if _redis is None:
        _redis = await redis.from_url(REDIS_URL, decode_responses=True)
    return _redis

class RadioVoice:
    def __init__(self, bot: commands.Bot):
        self.bot = bot
        self.voice: discord.VoiceClient | None = None
        self.volume: float = 0.7
        self.enabled: bool = RADIO_VOICE_ENABLED
        self.current_channel_id: int | None = None
        self._stopped = False
        self._watchdog_task: asyncio.Task | None = None

    async def start_watchdog(self):
        if self._watchdog_task:
            return
        self._watchdog_task = asyncio.create_task(self._watchdog())
    
    async def _publish_status(self):
        try:
            r = await get_redis()
            await r.set("voice:status", json.dumps(self.status()), ex=30)
        except Exception:
            pass

    async def _watchdog(self):
        while True:
            try:
                await asyncio.sleep(30)
                if not self.enabled:
                    continue
                if self.current_channel_id is None:
                    continue
                if self.voice is None or not self.voice.is_connected():
                    logger.warning("voice disconnected, reconnecting...")
                    await self.connect(self.current_channel_id)
                    continue
                if not self.voice.is_playing() and not self.voice.is_paused():
                    logger.warning("voice source ended, restarting playback")
                    await self._play()
                    await self._publish_status()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("voice watchdog iteration failed")

    async def connect(self, channel_id: int | None = None) -> bool:
        target_id = channel_id or self.current_channel_id or VOICE_CHANNEL_ID
        if not target_id:
            logger.warning("no voice channel configured")
            return False

        channel = self.bot.get_channel(target_id)
        if channel is None:
            try:
                channel = await self.bot.fetch_channel(target_id)
                logger.info(f"fetched channel {target_id} from API (not in cache)")
            except discord.NotFound:
                logger.error(f"voice channel {target_id} not found via API either")
                return False
            except discord.Forbidden:
                logger.error(f"no permission to fetch channel {target_id}")
                return False
            except Exception:
                logger.exception(f"failed to fetch channel {target_id}")
                return False

        if self.voice and self.voice.is_connected() and self.voice.channel.id == target_id:
            return True

        if self.voice:
            try:
                await self.voice.disconnect(force=True)
            except Exception:
                pass
            self.voice = None

        try:
            self.voice = await channel.connect(self_deaf=True, self_mute=False, reconnect=True)
            self.current_channel_id = target_id
            self.enabled = True
            self._stopped = False
            logger.info(f"voice connected to #{channel.name}")
            await self._set_activity("Anathema Radio")
            await self._play()
            await self.start_watchdog()
            await self._publish_status()
            return True
        except Exception:
            logger.exception("failed to connect to voice")
            return False

    async def disconnect(self) -> bool:
        self.enabled = False
        self._stopped = True
        if self.voice:
            try:
                self.voice.stop()
                await self.voice.disconnect(force=True)
            except Exception:
                logger.exception("failed to disconnect voice")
            finally:
                self.voice = None
        self.current_channel_id = None
        await self._set_activity(None)
        logger.info("voice disconnected")
        await self._publish_status()
        return True

    async def _set_activity(self, name: str | None):
        try:
            if name:
                await self.bot.change_presence(
                    activity=discord.Activity(type=discord.ActivityType.listening, name=name)
                )
            else:
                await self.bot.change_presence(activity=None)
        except Exception:
            logger.exception("failed to change presence")

    async def _play(self):
        if self.voice is None or not self.voice.is_connected():
            return

        before_opts = (
            "-reconnect 1 -reconnect_streamed 1 "
            "-reconnect_delay_max 5 -nostdin"
        )
        try:
            source = discord.FFmpegPCMAudio(
                RADIO_STREAM_URL,
                before_options=before_opts,
                options="-vn",
            )
            source = discord.PCMVolumeTransformer(source, volume=self.volume)

            def after(err):
                if err:
                    logger.error(f"voice playback error: {err}")
                if self._stopped:
                    return
                asyncio.run_coroutine_threadsafe(self._restart_later(), self.bot.loop)

            self.voice.play(source, after=after)
            logger.info("voice playback started")
        except Exception:
            logger.exception("failed to start playback")

    async def _restart_later(self, delay: float = 1.0):
        await asyncio.sleep(delay)
        if not self._stopped and self.enabled:
            await self._play()

    def set_volume(self, v: float):
        self.volume = max(0.0, min(1.0, float(v)))
        if self.voice and self.voice.source:
            try:
                self.voice.source.volume = self.volume
            except Exception:
                pass

    def status(self) -> dict:
        return {
            "enabled": self.enabled,
            "channel_id": self.current_channel_id,
            "volume": self.volume,
            "connected": bool(self.voice and self.voice.is_connected()),
            "playing": bool(self.voice and self.voice.is_playing()),
        }


async def voice_command_listener(bot: commands.Bot):
    r = await redis.from_url(REDIS_URL, decode_responses=True)
    pubsub = r.pubsub()
    await pubsub.subscribe("voice:commands")
    logger.info("voice command listener started")

    rv: RadioVoice = bot.radio_voice  # type: ignore

    try:
        while True:
            try:
                msg = await pubsub.get_message(
                    ignore_subscribe_messages=True,
                    timeout=1.0,
                )
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("pubsub get_message failed")
                await asyncio.sleep(1.0)
                continue

            if msg is None:
                if getattr(bot, "_shutting_down", False):
                    break
                continue

            if msg.get("type") != "message":
                continue

            try:
                data = json.loads(msg["data"])
            except Exception:
                continue

            cmd = data.get("cmd")
            try:
                if cmd == "join":
                    ch = data.get("channel_id")
                    await rv.connect(ch)
                elif cmd == "leave":
                    await rv.disconnect()
                elif cmd == "volume":
                    rv.set_volume(data.get("value", 0.7))
            except Exception:
                logger.exception(f"voice command {cmd} failed")
    finally:
        try:
            await pubsub.unsubscribe("voice:commands")
        except Exception:
            pass
        try:
            await pubsub.close()
        except Exception:
            pass
        try:
            await r.aclose()
        except Exception:
            pass
        logger.info("voice command listener stopped")