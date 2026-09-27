import aioboto3
from botocore.config import Config
from .config import (
    MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_HOST, MINIO_PORT,
    MINIO_SECURE, MINIO_RADIO_BUCKET,
)

session = aioboto3.Session()


def _client_kwargs():
    return dict(
        endpoint_url=f"http{'s' if MINIO_SECURE else ''}://{MINIO_HOST}:{MINIO_PORT}",
        aws_access_key_id=MINIO_ACCESS_KEY,
        aws_secret_access_key=MINIO_SECRET_KEY,
        config=Config(signature_version="s3v4"),
        use_ssl=MINIO_SECURE,
    )


async def upload_song(file_id: str, data: bytes) -> str:
    async with session.client("s3", **_client_kwargs()) as s3:
        try:
            await s3.head_bucket(Bucket=MINIO_RADIO_BUCKET)
        except Exception:
            await s3.create_bucket(
                Bucket=MINIO_RADIO_BUCKET,
                CreateBucketConfiguration={"LocationConstraint": ""},
            )
        await s3.put_object(
            Bucket=MINIO_RADIO_BUCKET,
            Key=file_id,
            Body=data,
            ContentType="audio/mpeg"
        )
    return file_id


async def download_song(file_id: str) -> bytes:
    async with session.client("s3", **_client_kwargs()) as s3:
        response = await s3.get_object(Bucket=MINIO_RADIO_BUCKET, Key=file_id)
        return await response["Body"].read()


async def delete_song(file_id: str) -> bool:
    async with session.client("s3", **_client_kwargs()) as s3:
        try:
            await s3.delete_object(Bucket=MINIO_RADIO_BUCKET, Key=file_id)
            return True
        except Exception:
            return False