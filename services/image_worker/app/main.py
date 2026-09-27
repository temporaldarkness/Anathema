import asyncio
import logging
import httpx
from .kafka_consumer import ImageRequestConsumer
from .kafka_producer import ImageResponseProducer, UsageProducer
from .ai_client import generate_image, edit_image
from .storage_client import StorageClient
from .pricing import compute_flat_cost

logger = logging.getLogger(__name__)

logging.basicConfig(
    level=logging.INFO,
    format = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

producer = ImageResponseProducer()
storage = StorageClient()
usage_producer = UsageProducer()

async def process_request(data):
    corr_id = data.get("correlation_id")
    command = data.get("command")
    prompt = data.get("prompt")
    image_file_ids = data.get("image_file_ids") or []
    user_id = data.get("user_id")
    n = data.get("n", 2)
    quality = data.get("quality", "low")
    size = data.get("size", "auto")

    logger.info(f"Processing request {corr_id} for command {command}")

    try:
        if command == "generate":
            images = await generate_image(prompt, n=n, quality=quality, size=size)
        elif command == "edit":
            if len(image_file_ids) == 0:
                raise ValueError("No images provided for edit")

            inputs = []
            for fid in image_file_ids:
                ibytes = await storage.download_file(fid)
                inputs.append(ibytes)
                await storage.delete_file(fid)
            images = await edit_image(prompt, inputs, n=n, quality=quality, size=size)
        else:
            raise ValueError(f"Unknown command: {command}")

        n_images = len(images)
        cost = compute_flat_cost("gpt-image-2", n_images)

        await usage_producer.emit(
            source="image_worker",
            model="gpt-image-2",
            tokens_in=0,
            tokens_out=0,
            cost_usd=cost,
            correlation_id=corr_id,
            user_id=user_id,
            success=True,
        )

        file_ids = []
        for img_bytes in images:
            meta = {
                "source": "image_worker",
                "command": command,
                "prompt": (prompt or "")[:500],
                "user_id": str(user_id or ""),
                "correlation_id": corr_id,
                "model": "gpt-image-2",
                "quality": quality,
                "size": size,
            }
            file_id = await storage.upload_file(img_bytes, "image/png", meta)
            file_ids.append(file_id)

        logger.info(f"Sending response for {corr_id}")
        await producer.send_response(corr_id, file_ids)

    except Exception as e:
        logger.warning(f"Error processing image request: {e}")
        try:
            await usage_producer.emit(
                source="image_worker",
                model="gpt-image-2",
                tokens_in=0,
                tokens_out=0,
                cost_usd=0.0,
                correlation_id=corr_id,
                user_id=user_id,
                success=False,
                error=str(e) or "Unknown error",
            )
        except Exception:
            logger.exception("Failed to emit failure usage")

        await producer.send_response(corr_id, [], error=str(e) or "Unknown error")

async def main():
    await producer.start()
    await usage_producer.start()
    consumer = ImageRequestConsumer(process_request)
    await consumer.start()
    
    logger.info("Image Worker started")
    try:
        await consumer.consume()
    finally:
        await consumer.stop()
        await producer.stop()
        await storage.close()
        await usage_producer.stop()

if __name__ == "__main__":
    asyncio.run(main())