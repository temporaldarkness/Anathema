import aioboto3
from botocore.config import Config
from botocore.exceptions import ClientError
from .config import MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_BUCKET, MINIO_SECURE, MINIO_HOST, MINIO_PORT
import uuid
import logging

logger = logging.getLogger(__name__)

session = aioboto3.Session()

async def save_file(data: bytes, content_type: str = "image/png") -> str:
    file_id = str(uuid.uuid4())
    logger.info(f"{MINIO_SECURE=}")
    async with session.client(
        "s3",
        endpoint_url=f"http{'s' if MINIO_SECURE else ''}://{MINIO_HOST}:{MINIO_PORT}",
        aws_access_key_id=MINIO_ACCESS_KEY,
        aws_secret_access_key=MINIO_SECRET_KEY,
        config=Config(signature_version="s3v4"),
        use_ssl=MINIO_SECURE
    ) as s3:
        try:
            await s3.head_bucket(Bucket=MINIO_BUCKET)
        except ClientError as e:
            if e.response['Error']['Code'] == '404':
                await s3.create_bucket(
                    Bucket=MINIO_BUCKET, 
                    CreateBucketConfiguration={"LocationConstraint": ""}
                )
            else:
                raise
        await s3.put_object(
            Bucket=MINIO_BUCKET, 
            Key=file_id, 
            Body=data, 
            ContentType=content_type,
            Metadata={"content-type": content_type}
        )
    return file_id


async def get_file(file_id: str) -> bytes:
    logger.info(f"{MINIO_SECURE=}")
    async with session.client(
        "s3",
        endpoint_url=f"http{'s' if MINIO_SECURE else ''}://{MINIO_HOST}:{MINIO_PORT}",
        aws_access_key_id=MINIO_ACCESS_KEY,
        aws_secret_access_key=MINIO_SECRET_KEY,
        config=Config(signature_version="s3v4"),
        use_ssl=MINIO_SECURE
    ) as s3:
        response = await s3.get_object(Bucket=MINIO_BUCKET, Key=file_id)
        content_type = response.get("ContentType", "application/octet-stream")
        data = await response["Body"].read()
        return data, content_type


async def delete_file(file_id: str) -> None:
    logger.info(f"{MINIO_SECURE=}")
    async with session.client(
        "s3",
        endpoint_url=f"http{'s' if MINIO_SECURE else ''}://{MINIO_HOST}:{MINIO_PORT}",
        aws_access_key_id=MINIO_ACCESS_KEY,
        aws_secret_access_key=MINIO_SECRET_KEY,
        config=Config(signature_version="s3v4"),
        use_ssl=MINIO_SECURE
    ) as s3:
        response = await s3.delete_object(Bucket=MINIO_BUCKET, Key=file_id)
    