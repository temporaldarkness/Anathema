import aioboto3
from botocore.config import Config
from botocore.exceptions import ClientError
from .config import MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_BUCKET, MINIO_SECURE, MINIO_HOST, MINIO_PORT
import uuid
import logging
from datetime import datetime, timezone
import json

logger = logging.getLogger(__name__)

session = aioboto3.Session()

def _encode_meta_value(v: str) -> str:
    return quote(str(v)[:1024], safe="")

def _client_kwargs() -> dict:
    return dict(
        endpoint_url=f"http{'s' if MINIO_SECURE else ''}://{MINIO_HOST}:{MINIO_PORT}",
        aws_access_key_id=MINIO_ACCESS_KEY,
        aws_secret_access_key=MINIO_SECRET_KEY,
        config=Config(signature_version="s3v4"),
        use_ssl=MINIO_SECURE,
    )


async def _ensure_bucket(s3) -> None:
    try:
        await s3.head_bucket(Bucket=MINIO_BUCKET)
    except ClientError as e:
        if e.response["Error"]["Code"] == "404":
            await s3.create_bucket(
                Bucket=MINIO_BUCKET,
                CreateBucketConfiguration={"LocationConstraint": ""},
            )
        else:
            raise


async def save_file(
    data: bytes,
    content_type: str = "image/png",
    metadata: dict | None = None,
) -> str:
    file_id = str(uuid.uuid4())
    
    SAFE_KEYS = {
        "source", "command", "user_id", "correlation_id",
        "quality", "size", "model",
    }

    safe_meta: dict[str, str] = {}
    for k, v in (metadata or {}).items():
        if v is None:
            continue
        if k not in SAFE_KEYS:
            continue
        value = str(v)
        try:
            value.encode("ascii")
        except UnicodeEncodeError:
            continue
        if len(value) > 128:
            value = value[:128]
        safe_meta[k] = value

    async with session.client("s3", **_client_kwargs()) as s3:
        await _ensure_bucket(s3)
        await s3.put_object(
            Bucket=MINIO_BUCKET,
            Key=file_id,
            Body=data,
            ContentType=content_type,
            Metadata=safe_meta,
        )
        
        if metadata:
            sidecar = json.dumps(metadata, ensure_ascii=False).encode("utf-8")
            await s3.put_object(
                Bucket=MINIO_BUCKET,
                Key=f"{file_id}.meta.json",
                Body=sidecar,
                ContentType="application/json",
            )
    return file_id


async def get_file(file_id: str) -> tuple[bytes, str]:
    """Возвращает (data, content_type)."""
    async with session.client("s3", **_client_kwargs()) as s3:
        response = await s3.get_object(Bucket=MINIO_BUCKET, Key=file_id)
        content_type = response.get("ContentType", "application/octet-stream")
        data = await response["Body"].read()
        return data, content_type


async def get_file_meta(file_id: str) -> dict | None:
    async with session.client("s3", **_client_kwargs()) as s3:
        try:
            head = await s3.head_object(Bucket=MINIO_BUCKET, Key=file_id)
        except ClientError:
            return None

        meta = {
            "file_id": file_id,
            "size": head.get("ContentLength"),
            "content_type": head.get("ContentType"),
            "last_modified": head["LastModified"].isoformat() if head.get("LastModified") else None,
            "metadata": dict(head.get("Metadata", {})),
        }
        try:
            sidecar_obj = await s3.get_object(
                Bucket=MINIO_BUCKET, Key=f"{file_id}.meta.json"
            )
            raw = await sidecar_obj["Body"].read()
            full = json.loads(raw)
            if isinstance(full, dict):
                meta["metadata"] = full
        except ClientError:
            pass

    return meta

async def list_files(limit: int = 60, offset: int = 0) -> dict:
    async with session.client("s3", **_client_kwargs()) as s3:
        all_objects = []
        paginator = s3.get_paginator("list_objects_v2")
        async for page in paginator.paginate(Bucket=MINIO_BUCKET):
            for obj in page.get("Contents", []) or []:
                if obj["Key"].endswith(".meta.json"):
                    continue
                all_objects.append(obj)

        all_objects.sort(
            key=lambda o: o.get("LastModified") or datetime.min.replace(tzinfo=timezone.utc),
            reverse=True,
        )

        total = len(all_objects)
        page_items = all_objects[offset: offset + limit]

        items = []
        for obj in page_items:
            key = obj["Key"]
            try:
                head = await s3.head_object(Bucket=MINIO_BUCKET, Key=key)
            except ClientError:
                continue

            item = {
                "file_id": key,
                "size": head.get("ContentLength"),
                "content_type": head.get("ContentType"),
                "last_modified": head["LastModified"].isoformat() if head.get("LastModified") else None,
                "metadata": dict(head.get("Metadata", {})),
            }

            try:
                sc = await s3.get_object(Bucket=MINIO_BUCKET, Key=f"{key}.meta.json")
                raw = await sc["Body"].read()
                full = json.loads(raw)
                if isinstance(full, dict):
                    item["metadata"] = full
            except ClientError:
                pass

            items.append(item)

        return {"items": items, "total": total, "limit": limit, "offset": offset}


async def delete_file(file_id: str) -> bool:
    async with session.client("s3", **_client_kwargs()) as s3:
        try:
            await s3.head_object(Bucket=MINIO_BUCKET, Key=file_id)
        except ClientError:
            return False

        await s3.delete_object(Bucket=MINIO_BUCKET, Key=file_id)
        try:
            await s3.delete_object(Bucket=MINIO_BUCKET, Key=f"{file_id}.meta.json")
        except ClientError:
            pass
        return True