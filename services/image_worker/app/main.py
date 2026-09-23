import asyncio
import logging
import httpx
from .kafka_consumer import ImageRequestConsumer
from .kafka_producer import ImageResponseProducer
from .ai_client import generate_image, edit_image
from .storage_client import StorageClient

logger = logging.getLogger(__name__)

logging.basicConfig(
    level=logging.INFO,
    format = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

producer = ImageResponseProducer()
storage = StorageClient()

async def process_request(data):
    corr_id = data.get("correlation_id")
    command = data.get("command")
    prompt = data.get("prompt")
    image_file_ids = data.get("image_file_ids")
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
        logger.info(f"Image bytes received")
        
        file_ids = []
        for img_bytes in images:
            file_id = await storage.upload_file(img_bytes, "image/png")
            file_ids.append(file_id)
        
        logger.info(f"Sending response for {corr_id}")
        await producer.send_response(corr_id, file_ids)
    except Exception as e:
        logger.warning(f"Error processing image request: {e}")
        await producer.send_response(corr_id, [], error=str(e) or 'Unknown error')

async def main():
    await producer.start()
    consumer = ImageRequestConsumer(process_request)
    await consumer.start()
    
    logger.info("Image Worker started")
    try:
        await consumer.consume()
    finally:
        await consumer.stop()
        await producer.stop()
        await storage.close()

if __name__ == "__main__":
    asyncio.run(main())