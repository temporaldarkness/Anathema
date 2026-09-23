import discord
import base64
import io
from discord.ext import commands
from discord import app_commands
import asyncio
from .memory_client import MemoryClient
from .storage_client import StorageClient
from .kafka_producer import KafkaProducer
from .kafka_consumer import AIResponseConsumer, ImageResponseConsumer, AdminResponseConsumer, ReactionCommandConsumer
import redis.asyncio as redis
import logging
from .config import REDIS_URL, REDIS_PENDING_AI_PREFIX, REDIS_PENDING_IMAGE_PREFIX, REDIS_PENDING_ADMIN_PREFIX, PENDING_TTL_SECONDS

logger = logging.getLogger(__name__)

class DiscordBot(commands.Bot):
    def __init__(self, memory: MemoryClient, storage: StorageClient,
        ai_response_consumer: AIResponseConsumer,
        reaction_command_consumer: ReactionCommandConsumer,
        image_response_consumer: ImageResponseConsumer,
        admin_response_consumer: AdminResponseConsumer,
        producer: KafkaProducer):
        
        intents = discord.Intents.all()
        super().__init__(command_prefix="!", intents=intents)
        self.memory = memory
        self.storage = storage
        self.producer = producer
        self.ai_response_consumer = ai_response_consumer
        self.reaction_command_consumer = reaction_command_consumer
        self.image_response_consumer = image_response_consumer
        self.admin_response_consumer = admin_response_consumer
        
        self.redis = None
        self.pending_responses = {}
    
    async def setup_hook(self):
        self.redis = await redis.from_url(REDIS_URL, decode_responses=True)
        await self.producer.start()
        await self.ai_response_consumer.start()
        await self.reaction_command_consumer.start()
        await self.image_response_consumer.start()
        await self.admin_response_consumer.start()
        
        @self.tree.command(name="ping", description="Проверка работоспособности")
        async def ping(interaction: discord.Interaction):
            await self._ping(interaction)
        
        @self.tree.command(name="ball", description="Задать вопрос магическому шару")
        async def ball(interaction: discord.Interaction, вопрос: str):
            await self._ball(interaction, вопрос)
        
        @self.tree.command(name="revelation", description="Получить краткий ответ на вопрос")
        async def revelation(interaction: discord.Interaction, вопрос: str):
            await self._revelation(interaction, вопрос)
        
        @self.tree.command(name="image", description="Сгенерировать изображение по тексту")
        async def generate_image(interaction: discord.Interaction, 
            промт: str,
            количество: int = 2,
            качество: str = "low",
            разрешение: str = "auto"
        ):
            await self._generate_image(
                interaction, 
                промт, 
                количество=количество, 
                качество=качество, 
                разрешение=разрешение
            )
        
        @self.tree.command(name="edit", description="Редактировать изображение")
        async def edit_image(interaction: discord.Interaction, 
            промт: str, 
            изображение1: discord.Attachment, 
            изображение2: discord.Attachment = None, 
            изображение3: discord.Attachment = None,
            количество: int = 2,
            качество: str = "low",
            разрешение: str = "auto"
        ):
            await self._edit_image(
                interaction, 
                промт, 
                изображение1=изображение1,
                изображение2=изображение2,
                изображение3=изображение3,
                количество=количество,
                качество=качество,
                разрешение=разрешение
            )
        
        @self.tree.command(name="maintenance", description="Установить булевый параметр")
        async def maintenance(interaction: discord.Interaction, параметр: str, значение: bool):
            await self._maintenance(interaction, параметр, значение)
        
        @self.tree.command(name="channel", description="Настроить информацию о канале")
        async def channel(interaction: discord.Interaction, идентификатор: str, название: str, описание: str, промт: str):
            await self._channel(interaction, идентификатор, название, описание, промт)
        
        await self.tree.sync()
        print("Synced guild commands")
    
    async def on_ready(self):
        logger.info(f"Logged in as {self.user}")
    
    async def on_message(self, message: discord.Message):
        await self.producer.send_raw_message(
            message_id=str(message.id),
            channel_id=message.channel.id,
            user_id=message.author.id,
            username=message.author.name,
            content=message.content,
            timestamp=message.created_at.isoformat(),
            reply_to_message_id=str(message.reference.message_id) if message.reference else None,
            attachments=[]
        )
        
        if message.author == self.user:
            return
        
        if self.user in message.mentions:
            await self._process_mention(message)
            
            await self.process_commands(message)
    
    async def _process_mention(self, message: discord.Message):
        async with message.channel.typing():
            user_data = await self.memory.get_user_by_discord_id(message.author.id)
            channel_data = await self.memory.get_channel_by_discord_id(message.channel.id)
            ltm = await self.memory.get_ltm()
            settings = await self.memory.get_settings()
            
            correlation_id = str(message.id)
            
            await self.redis.setex(
                f"{REDIS_PENDING_AI_PREFIX}{correlation_id}",
                PENDING_TTL_SECONDS,
                f"{message.channel.id}:{message.id}"
            )
            
            await self.producer.send_ai_request(
                correlation_id=correlation_id,
                channel_id=message.channel.id,
                user_id=message.author.id,
                content=message.content,
                ltm=ltm,
                user_data=user_data,
                channel_data=channel_data,
                settings=settings,
                mode="chat"
            )
            try:
                await message.add_reaction("⏳")
            except:
                pass
    
    async def _ping(self, interaction: discord.Interaction):
        await interaction.response.send_message("Pong!", ephemeral=True)
    
    async def _ball(self, interaction: discord.Interaction, вопрос: str):
        await interaction.response.defer()
        followup = interaction.followup
        
        correlation_id = f"ball_{interaction.id}"
        settings = await self.memory.get_settings()
        ltm = []
        user_data = await self.memory.get_user_by_discord_id(interaction.user.id)
        channel_data = await self.memory.get_channel_by_discord_id(interaction.channel_id)
        
        await self.redis.setex(f"{REDIS_PENDING_IMAGE_PREFIX}{correlation_id}", PENDING_TTL_SECONDS, f"{followup.id}:{followup.token}")
        
        await self.producer.send_ai_request(
            correlation_id=correlation_id,
            channel_id=interaction.channel_id,
            user_id=interaction.user.id,
            content=вопрос,
            ltm=ltm,
            user_data=user_data,
            channel_data=channel_data,
            settings=settings,
            mode="ball"
        )
    
    async def _revelation(self, interaction: discord.Interaction, вопрос: str):
        await interaction.response.defer()
        followup = interaction.followup
        
        correlation_id = f"rev_{interaction.id}"
        settings = await self.memory.get_settings()
        ltm = []
        user_data = await self.memory.get_user_by_discord_id(interaction.user.id)
        channel_data = await self.memory.get_channel_by_discord_id(interaction.channel_id)
        
        await self.redis.setex(f"{REDIS_PENDING_AI_PREFIX}{correlation_id}", PENDING_TTL_SECONDS, f"{followup.id}:{followup.token}")
        
        await self.producer.send_ai_request(
            correlation_id=correlation_id,
            channel_id=interaction.channel_id,
            user_id=interaction.user.id,
            content=вопрос,
            ltm=ltm,
            user_data=user_data,
            channel_data=channel_data,
            settings=settings,
            mode="revelation"
        )
    
    async def _generate_image(self, interaction: discord.Interaction, 
        промт: str,
        количество: int = 2,
        качество: str = "low",
        разрешение: str = "auto"
    ):
        await interaction.response.defer()
        followup = interaction.followup
        correlation_id = f"img_{interaction.id}"
        
        await self.redis.setex(f"{REDIS_PENDING_IMAGE_PREFIX}{correlation_id}", PENDING_TTL_SECONDS, f"{followup.id}:{followup.token}")
        
        await self.producer.send_image_request(
            correlation_id, 
            "generate", 
            промт, 
            image_file_ids=[], 
            n=количество,
            quality=качество,
            size=разрешение
            )
    
    async def _edit_image(self, interaction: discord.Interaction, 
        промт: str, 
        изображение1: discord.Attachment, 
        изображение2: discord.Attachment = None, 
        изображение3: discord.Attachment = None,
        количество: int = 2,
        качество: str = "low",
        разрешение: str = "auto"
    ):
        await interaction.response.defer()
        followup = interaction.followup
        correlation_id = f"edit_{interaction.id}"
        
        file_ids = []
        for img in [изображение1, изображение2, изображение3]:
            if img:
                img_bytes = await img.read()
                file_id = await self.storage.upload_file(img_bytes, img.content_type or "image/png")
                file_ids.append(file_id)
        
        await self.redis.setex(f"{REDIS_PENDING_IMAGE_PREFIX}{correlation_id}", PENDING_TTL_SECONDS, f"{followup.id}:{followup.token}")
        
        await self.producer.send_image_request(
            correlation_id, 
            "edit", 
            промт, 
            image_file_ids=file_ids, 
            n=количество,
            quality=качество,
            size=разрешение
        )
    
    async def _maintenance(self, interaction: discord.Interaction, параметр: str, значение: bool):
        await interaction.response.defer(ephemeral=True)
        followup = interaction.followup
        
        correlation_id = f"maint_{interaction.id}"
        
        await self.redis.setex(f"{REDIS_PENDING_ADMIN_PREFIX}{correlation_id}", PENDING_TTL_SECONDS, f"{followup.id}:{followup.token}")
        await self.producer.send_admin_command(
            correlation_id=correlation_id, 
            command="maintenance",
            data={"parameter": параметр, "value": значение},
            user_id=interaction.user.id,
            guild_id=interaction.guild_id if interaction.guild else 0,
            channel_id=interaction.channel.id
        )
    
    async def _channel(self, interaction: discord.Interaction, идентификатор: str, название: str, описание: str, промт: str):
        await interaction.response.defer(ephemeral=True)
        followup = interaction.followup
        
        correlation_id = f"chan_{interaction.id}"
        
        await self.redis.setex(f"{REDIS_PENDING_ADMIN_PREFIX}{correlation_id}", PENDING_TTL_SECONDS, f"{followup.id}:{followup.token}")
        await self.producer.send_admin_command(
            correlation_id=correlation_id, 
            command="channel",
            data={"uid": идентификатор, "name": название, "description": описание, "prompt": промт},
            user_id=interaction.user.id,
            guild_id=interaction.guild_id if interaction.guild else 0,
            channel_id=interaction.channel.id
        )
    
    async def on_ai_response(self, correlation_id, response_text, mode):
        key = f"{REDIS_PENDING_AI_PREFIX}{correlation_id}"
        pending = await self.redis.get(key)
        if not pending:
            logger.info(f"Orphaned response for {correlation_id}")
            return
        parts = pending.split(":")
        logger.info(f"{mode=}")
        if mode == "chat":
            channel_id, message_id = int(parts[0]), int(parts[1])
            channel = self.get_channel(channel_id)
            if channel:
                try:
                    original_msg = await channel.fetch_message(message_id)
                    await original_msg.reply(response_text)
                    await original_msg.remove_reaction("⏳", self.user)
                except Exception as e:
                    await channel.send(response_text)
        else:
            webhook_id, webhook_token = parts[0], parts[1]
            webhook = discord.Webhook.partial(webhook_id, webhook_token, client=self)
            await webhook.send(content=response_text, wait=True)
        await self.redis.delete(key)
    
    async def on_image_response(self, correlation_id, image_keys, error):
        key = f"{REDIS_PENDING_IMAGE_PREFIX}{correlation_id}"
        pending = await self.redis.get(key)
        if not pending:
            logger.info(f"Orphaned response for {correlation_id}")
            return
        logger.info(f"Responding to {correlation_id}")
        webhook_id, webhook_token = pending.split(":")
        webhook = discord.Webhook.partial(webhook_id, webhook_token, client=self)
        if error:
            await webhook.send(f"Ошибка генерации: {error}")
            return
            
        files = []
        for key in image_keys:
            try:
                data = await self.storage.download_file(key)
                files.append(discord.File(io.BytesIO(data), filename=f"{key}.png"))
                await self.storage.delete_file(key)
            except Exception as e:
                logger.warning(f"Failed to download {key}: {e}")
        if files:
            await webhook.send("Вот тебе, только не бей:", files=files)
    
    async def on_admin_response(self, correlation_id, result, error):
        key = f"{REDIS_PENDING_ADMIN_PREFIX}{correlation_id}"
        pending = await self.redis.get(key)
        if not pending:
            logger.warning(f"Orphaned response for {correlation_id}")
            return
        
        webhook_id, webhook_token = pending.split(":")
        webhook = discord.Webhook.partial(webhook_id, webhook_token, client=self)
        await webhook.send(content=result if result else f"Ошибка: {error}", wait=True)
        await self.redis.delete(key)
    
    async def on_reaction_command(self, channel_id: int, message_id: int, emoji: str):
        channel = self.get_channel(channel_id)
        if channel:
            try:
                message = await channel.fetch_message(message_id)
                await message.add_reaction(emoji)
            except Exception as e:
                logger.warning(f"Failed to add reaction: {e}")
    
    async def close(self):
        await self.producer.stop()
        await self.ai_response_consumer.stop()
        await self.reaction_command_consumer.stop()
        await self.image_response_consumer.stop()
        await self.admin_response_consumer.stop()
        await self.storage.close()
        await self.memory.close()
        if self.redis:
            await self.redis.close()
        await super().close()